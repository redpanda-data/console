/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

/*eslint block-scoped-var: "error"*/

import { create } from '@bufbuild/protobuf';
import { createLinkedAbortController } from '@connectrpc/connect/protocol';
import {
  ListMessagesRequestSchema,
  type ListMessagesResponse,
} from 'protogen/redpanda/api/console/v1alpha1/list_messages_pb';

import type { PayloadEncoding } from '../protogen/redpanda/api/console/v1alpha1/common_pb';
import { config as appConfig } from '../runtime-config';
import type { TopicMessage } from '../state/rest-interfaces';
import { PartitionOffsetOrigin } from '../types/topic-settings';
import { appendWithSlackCap } from '../utils/bounded-array';
import { convertListMessageData } from '../utils/message-converters';
import { isNonEmptyString } from '../utils/string-utils';
import { showToast } from '../utils/toast.utils';

export type MessageSearchRequest = {
  topicName: string;
  startOffset: number;
  startTimestamp: number;
  partitionId: number;
  maxResults: number; // should also support '-1' soon, so we can do live tailing
  pageToken?: string; // Page token for pagination (only used when maxResults = -1)
  pageSize?: number; // Number of messages per page (only used when maxResults = -1, defaults to 50)
  filterInterpreterCode: string; // js code, base64 encoded
  enterprise?: {
    redpandaCloud?: {
      accessToken: string;
    };
  };
  includeRawPayload?: boolean;
  ignoreSizeLimit?: boolean;

  keyDeserializer?: PayloadEncoding;
  valueDeserializer?: PayloadEncoding;
  schemaContext?: string; // '' resolves the topic's context, '.' forces the default.
};

/**
 * Sliding-window cap for the live-tail / filtered message buffer (`messageSearch.messages`).
 * Those streams append for up to 30 minutes; on a high-volume topic the array would otherwise
 * grow unbounded for the whole window — the dominant long-lived-tab retention vector.
 */
const LIVE_TAIL_MAX_MESSAGES = 50_000;

/**
 * Slack above `LIVE_TAIL_MAX_MESSAGES` before a trim runs, so the O(n) `splice` happens once per
 * ~slack messages instead of on every message past the cap (which would be hottest exactly on the
 * high-volume streams this guards). The memory ceiling stays cap + slack.
 */
const LIVE_TAIL_TRIM_SLACK = 1024;

type MessageSearchState = {
  searchRequest: MessageSearchRequest | null;
  searchPhase: string | null;
  elapsedMs: number | null;
  bytesConsumed: number;
  totalMessagesConsumed: number;
  nextPageToken: string | null;
  isLoadingMore: boolean;
  abortController: AbortController | null;
  messages: TopicMessage[];
};

type ListMessagesControl = ListMessagesResponse['controlMessage'];
type ConsoleClient = NonNullable<typeof appConfig.consoleClient>;

const SEARCH_TIMEOUT_MS = 30 * 1000;
const LIVE_TAIL_TIMEOUT_MS = 30 * 60 * 1000;

function requireConsoleClient(): ConsoleClient {
  // https://connectrpc.com/docs/web/using-clients
  // https://github.com/connectrpc/connect-es
  // https://github.com/connectrpc/examples-es
  const client = appConfig.consoleClient;

  if (!client) {
    // this shouldn't happen but better to explicitly throw
    throw new Error('No console client configured');
  }
  return client;
}

function withCloudAccessToken(searchRequest: MessageSearchRequest): MessageSearchRequest {
  return {
    ...searchRequest,
    ...(isNonEmptyString(appConfig.jwt)
      ? {
          enterprise: {
            redpandaCloud: {
              accessToken: appConfig.jwt,
            },
          },
        }
      : {}),
  };
}

function toListMessagesRequest(searchRequest: MessageSearchRequest) {
  return create(ListMessagesRequestSchema, {
    topic: searchRequest.topicName,
    startOffset: BigInt(searchRequest.startOffset),
    startTimestamp: BigInt(searchRequest.startTimestamp),
    partitionId: searchRequest.partitionId,
    maxResults: searchRequest.maxResults,
    pageToken: searchRequest.pageToken ?? '',
    pageSize: searchRequest.pageSize ?? 0,
    filterInterpreterCode: searchRequest.filterInterpreterCode,
    includeOriginalRawPayload: searchRequest.includeRawPayload ?? false,
    ignoreMaxSizeLimit: searchRequest.ignoreSizeLimit ?? false,
    keyDeserializer: searchRequest.keyDeserializer,
    valueDeserializer: searchRequest.valueDeserializer,
    schemaContext: searchRequest.schemaContext ?? '',
  });
}

// For StartOffset = Newest and any set push-down filter we need to bump the default timeout
// from 30s to 30 minutes before ending the request gracefully.
// The same condition marks a live-tail/filtered stream, which appends for the whole window
// and so needs the sliding-window cap below (normal pagination never enters this branch).
function isLiveTailSearch(searchRequest: MessageSearchRequest): boolean {
  return searchRequest.startOffset === PartitionOffsetOrigin.End || searchRequest.filterInterpreterCode !== null;
}

function beginSearch(
  search: MessageSearchState,
  searchRequest: MessageSearchRequest,
  append: boolean,
  notify: () => void
) {
  search.searchRequest = searchRequest;
  search.searchPhase = 'Connecting';
  search.bytesConsumed = 0;
  search.totalMessagesConsumed = 0;
  if (!append) {
    search.messages.length = 0;
    notify();
  }
  search.isLoadingMore = append;
  search.elapsedMs = null;
}

function resetSearchProgress(search: MessageSearchState) {
  search.searchPhase = null;
  search.bytesConsumed = 0;
  search.totalMessagesConsumed = 0;
}

function finishSearch(
  search: MessageSearchState,
  done: Extract<
    ListMessagesControl,
    {
      case: 'done';
    }
  >['value'],
  notify: () => void
) {
  search.elapsedMs = Number(done.elapsedMs);
  search.bytesConsumed = Number(done.bytesConsumed);
  search.nextPageToken = done.nextPageToken || null;
  search.isLoadingMore = false;
  search.searchPhase = null;
  notify();
}

// error doesn't necessarily mean the whole request is done
function reportSearchBackendError(message: string) {
  // biome-ignore lint/suspicious/noConsole: intentional console usage
  console.info(`ws backend error: ${message}`);
  showToast({
    title: 'Backend Error',
    description: message,
    status: 'error',
    duration: 5000,
  });
}

function appendSearchMessage(search: MessageSearchState, message: TopicMessage, isLiveTail: boolean) {
  // Bound the live-tail/filtered buffer to a sliding window so a 30-minute stream on
  // a high-volume topic cannot grow the heap without limit. appendWithSlackCap
  // amortizes the O(n) trim to ~once per LIVE_TAIL_TRIM_SLACK messages.
  if (isLiveTail) {
    appendWithSlackCap(search.messages, message, LIVE_TAIL_MAX_MESSAGES, LIVE_TAIL_TRIM_SLACK);
  } else {
    search.messages.push(message);
  }
}

function applySearchControl(
  search: MessageSearchState,
  control: ListMessagesControl,
  isLiveTail: boolean,
  notify: () => void
) {
  switch (control.case) {
    case 'phase':
      search.searchPhase = control.value.phase;
      break;
    case 'progress':
      search.bytesConsumed = Number(control.value.bytesConsumed);
      search.totalMessagesConsumed = Number(control.value.messagesConsumed);
      break;
    case 'done':
      finishSearch(search, control.value, notify);
      break;
    case 'error':
      reportSearchBackendError(control.value.message);
      break;
    case 'data':
      appendSearchMessage(search, convertListMessageData(control.value), isLiveTail);
      break;
    case undefined:
    default:
      break;
  }
}

// A malformed frame is logged and skipped, so one bad message doesn't end the stream.
function applySearchResponse(
  search: MessageSearchState,
  res: ListMessagesResponse,
  isLiveTail: boolean,
  notify: () => void
) {
  try {
    applySearchControl(search, res.controlMessage, isLiveTail, notify);
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error('error in listMessages loop', { error });
  }
}

// https://connectrpc.com/docs/web/errors
function failSearch(search: MessageSearchState, abortSignal: AbortSignal, error: unknown) {
  resetSearchProgress(search);
  if (abortSignal.aborted) {
    return; // Do not throw, this is a user cancellation
  }
  // biome-ignore lint/suspicious/noConsole: intentional console usage
  console.error('startMessageSearchNew: error in await loop of client.listMessages', { error });
  throw error;
}

async function streamSearchMessages(
  search: MessageSearchState,
  client: ConsoleClient,
  searchRequest: MessageSearchRequest,
  abortSignal: AbortSignal,
  notify: () => void
) {
  const req = toListMessagesRequest(searchRequest);
  const isLiveTail = isLiveTailSearch(searchRequest);
  try {
    const responses = client.listMessages(req, {
      signal: abortSignal,
      timeoutMs: isLiveTail ? LIVE_TAIL_TIMEOUT_MS : SEARCH_TIMEOUT_MS,
    });
    for await (const res of responses) {
      if (abortSignal.aborted) {
        break;
      }
      applySearchResponse(search, res, isLiveTail, notify);
    }
  } catch (error) {
    failSearch(search, abortSignal, error);
  } finally {
    // Always cleanup the abort controller reference to prevent memory leaks
    // This ensures cleanup happens whether the stream completes, errors, or is cancelled
    search.abortController = null;
  }
}

export function createLegacyMessageSearch(notify: () => void) {
  const messageSearch = {
    // Parameters last passed to 'startMessageSearch'
    searchRequest: null as MessageSearchRequest | null,

    // Some statistics that might be interesting to show in the UI
    searchPhase: null as string | null, // A search has different phases, like "waiting for mssages", or "creating consumers", messageSearch string is directly reported by the backend
    elapsedMs: null as null | number, // Reported by the backend, only set once the search is done
    bytesConsumed: 0,
    totalMessagesConsumed: 0,

    // Pagination state
    nextPageToken: null as string | null,
    isLoadingMore: false,
    // Call 'stopSearch' instead of using messageSearch directly
    abortController: null as AbortController | null,

    // Live view of messages, gets updated as new messages arrive
    messages: [] as TopicMessage[],

    async startSearch(
      _searchRequest: MessageSearchRequest,
      externalSignal?: AbortSignal,
      append = false
    ): Promise<TopicMessage[]> {
      const client = requireConsoleClient();
      if (isNonEmptyString(messageSearch.searchPhase)) {
        // There is a search running already, abort it
        messageSearch.stopSearch('starting a new search');
      }

      const searchRequest = withCloudAccessToken(_searchRequest);
      beginSearch(messageSearch, searchRequest, append, notify);
      // Links external signal (component control) with internal controller - both can abort the same stream
      // Ensures cleanup works from component unmount AND direct stopSearch() calls
      const linkedController = createLinkedAbortController(externalSignal);
      messageSearch.abortController = linkedController;
      // do it
      await streamSearchMessages(messageSearch, client, searchRequest, linkedController.signal, notify);
      // one done
      messageSearch.stopSearch();
      return messageSearch.messages;
    },

    stopSearch(reason?: string) {
      if (messageSearch.abortController) {
        messageSearch.abortController.abort(reason ?? 'aborted by user');
        messageSearch.abortController = null;
      }
      if (messageSearch.searchPhase !== null) {
        resetSearchProgress(messageSearch);
      }
    },

    async loadMore(loadMorePageSize?: number, externalSignal?: AbortSignal): Promise<TopicMessage[]> {
      if (!isNonEmptyString(messageSearch.nextPageToken)) {
        throw new Error('No next page available');
      }
      if (!messageSearch.searchRequest) {
        throw new Error('No search request available');
      }

      const nextRequest = {
        ...messageSearch.searchRequest,
        pageToken: messageSearch.nextPageToken,
        pageSize: loadMorePageSize ?? messageSearch.searchRequest.pageSize,
      };
      return await messageSearch.startSearch(nextRequest, externalSignal, true);
    },
  };

  return messageSearch;
}
export type MessageSearch = ReturnType<typeof createLegacyMessageSearch>;
