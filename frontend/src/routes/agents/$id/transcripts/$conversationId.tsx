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
import { createQueryOptions } from '@connectrpc/connect-query';
import { createFileRoute } from '@tanstack/react-router';
import { ConversationDetailPage } from 'components/pages/agents/details/conversation-detail-page';
import { GetTranscriptRequestSchema } from 'protogen/redpanda/api/dataplane/v1alpha3/transcript_pb';
import { getTranscript } from 'protogen/redpanda/api/dataplane/v1alpha3/transcript-TranscriptService_connectquery';
import { useSupportedFeaturesStore } from 'state/supported-features';

export const Route = createFileRoute('/agents/$id/transcripts/$conversationId')({
  staticData: {
    title: 'Conversation',
  },
  loader: ({ context: { queryClient, dataplaneTransport }, params: { id, conversationId } }) => {
    if (!useSupportedFeaturesStore.getState().tracingService) {
      return;
    }
    // Prefetch without blocking — component handles loading/error states
    queryClient.prefetchQuery(
      createQueryOptions(getTranscript, create(GetTranscriptRequestSchema, { agentId: id, conversationId }), {
        transport: dataplaneTransport,
      })
    );
  },
  component: ConversationDetailPage,
});
