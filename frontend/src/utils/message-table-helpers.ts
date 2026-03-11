/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { PayloadEncoding } from '../protogen/redpanda/api/console/v1alpha1/common_pb';
import { createMessageSearch, type MessageSearchRequest } from '../state/backend-api';
import type { TopicMessage } from '../state/rest-interfaces';

/**
 * Case-insensitive substring match against a message's offset, key JSON, and value JSON.
 */
export function isFilterMatch(str: string, m: TopicMessage): boolean {
  const lowerStr = str.toLowerCase();
  if (m.offset.toString().toLowerCase().includes(lowerStr)) {
    return true;
  }
  if (m.keyJson?.toLowerCase().includes(lowerStr)) {
    return true;
  }
  if (m.valueJson?.toLowerCase().includes(lowerStr)) {
    return true;
  }
  return false;
}

/**
 * Pure function for sliding-window trimming of messages.
 * Keeps at most maxResults + pageSize messages in the window,
 * trimming only pages before the user's current view.
 */
export function trimSlidingWindow({
  messages,
  maxResults,
  pageSize,
  currentGlobalPage,
  windowStartPage,
  virtualStartIndex,
}: {
  messages: TopicMessage[];
  maxResults: number;
  pageSize: number;
  currentGlobalPage: number;
  windowStartPage: number;
  virtualStartIndex: number;
}): { messages: TopicMessage[]; windowStartPage: number; virtualStartIndex: number; trimCount: number } {
  const maxWindowSize = maxResults + pageSize;

  if (maxResults < pageSize || messages.length <= maxWindowSize) {
    return { messages, windowStartPage, virtualStartIndex, trimCount: 0 };
  }

  const excess = messages.length - maxWindowSize;
  const currentLocalPage = Math.max(0, currentGlobalPage - windowStartPage);

  // Never trim the page the user is currently viewing or the one before it
  const maxPagesToTrim = Math.max(0, currentLocalPage - 1);
  const pagesToTrim = Math.min(Math.floor(excess / pageSize), maxPagesToTrim);
  const trimCount = pagesToTrim * pageSize;

  if (trimCount === 0) {
    return { messages, windowStartPage, virtualStartIndex, trimCount: 0 };
  }

  return {
    messages: messages.slice(trimCount),
    windowStartPage: windowStartPage + pagesToTrim,
    virtualStartIndex: virtualStartIndex + trimCount,
    trimCount,
  };
}

/**
 * Load a single large message by partition ID and offset, returning the loaded message.
 * Callers are responsible for replacing the old message in their own state.
 */
export async function loadLargeMessage(
  topicName: string,
  partitionID: number,
  offset: number,
  keyDeserializer: PayloadEncoding = PayloadEncoding.UNSPECIFIED,
  valueDeserializer: PayloadEncoding = PayloadEncoding.UNSPECIFIED
): Promise<TopicMessage> {
  const search = createMessageSearch();
  const searchReq: MessageSearchRequest = {
    filterInterpreterCode: '',
    maxResults: 1,
    partitionId: partitionID,
    startOffset: offset,
    startTimestamp: 0,
    topicName,
    includeRawPayload: true,
    ignoreSizeLimit: true,
    keyDeserializer,
    valueDeserializer,
  };
  const result = await search.startSearch(searchReq);

  if (result && result.length === 1) {
    return result[0];
  }
  throw new Error("LoadLargeMessage: Couldn't load the message content, the response was empty");
}
