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
import { Code, ConnectError } from '@connectrpc/connect';
import { createQueryOptions } from '@connectrpc/connect-query';
import { createFileRoute, notFound, useParams } from '@tanstack/react-router';
import { fallback, zodValidator } from '@tanstack/zod-adapter';
import { NotFoundContent } from 'components/misc/not-found-content';
import { GetAIAgentRequestSchema } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import { getAIAgent } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent-AIAgentService_connectquery';
import { z } from 'zod';

import { AIAgentDetailsPage } from '../../components/pages/agents/details/ai-agent-details-page';

const searchSchema = z.object({
  tab: fallback(z.string().optional(), undefined),
});

function AIAgentNotFound() {
  const { id } = useParams({ from: '/agents/$id' });
  return (
    <NotFoundContent backLink="/agents" backLinkText="Back to AI Agents" resourceId={id} resourceType="AI Agent" />
  );
}

export const Route = createFileRoute('/agents/$id')({
  staticData: {
    title: 'AI Agent Details',
  },
  validateSearch: zodValidator(searchSchema),
  loader: async ({ context: { queryClient, dataplaneTransport }, params: { id } }) => {
    try {
      await queryClient.ensureQueryData(
        createQueryOptions(getAIAgent, create(GetAIAgentRequestSchema, { id }), { transport: dataplaneTransport })
      );
    } catch (error) {
      if (error instanceof ConnectError && error.code === Code.NotFound) {
        throw notFound();
      }
      throw error;
    }
  },
  notFoundComponent: AIAgentNotFound,
  component: AIAgentDetailsPage,
});
