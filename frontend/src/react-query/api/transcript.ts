/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { create } from '@bufbuild/protobuf';
import type { GenMessage } from '@bufbuild/protobuf/codegenv1';
import { useQuery } from '@connectrpc/connect-query';
import {
  type GetTranscriptRequest,
  GetTranscriptRequestSchema,
  type GetTranscriptResponse,
  type ListTranscriptsRequest,
  ListTranscriptsRequestSchema,
  type ListTranscriptsResponse,
} from 'protogen/redpanda/api/dataplane/v1alpha3/transcript_pb';
import {
  getTranscript,
  listTranscripts,
} from 'protogen/redpanda/api/dataplane/v1alpha3/transcript-TranscriptService_connectquery';
import type { QueryOptions } from 'react-query/react-query.utils';

export const useListTranscriptsQuery = (
  input: { agentId: string },
  options?: QueryOptions<GenMessage<ListTranscriptsRequest>, ListTranscriptsResponse>
) => {
  const request = create(ListTranscriptsRequestSchema, {
    agentId: input.agentId,
    pageSize: -1, // Fetch all; TODO: add server-side pagination for large conversation histories
  });

  return useQuery(listTranscripts, request, {
    enabled: options?.enabled ?? !!input.agentId,
  });
};

export const useGetTranscriptQuery = (
  input: { agentId: string; conversationId: string },
  options?: QueryOptions<GenMessage<GetTranscriptRequest>, GetTranscriptResponse>
) => {
  const request = create(GetTranscriptRequestSchema, {
    agentId: input.agentId,
    conversationId: input.conversationId,
  });

  return useQuery(getTranscript, request, {
    enabled: options?.enabled ?? (!!input.agentId && !!input.conversationId),
  });
};
