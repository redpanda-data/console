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
import { AIIcon } from 'components/icons';
import { ListAIAgentsRequestSchema } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent_pb';
import { listAIAgents } from 'protogen/redpanda/api/dataplane/v1alpha3/ai_agent-AIAgentService_connectquery';

import { AIAgentsListPage } from '../../components/pages/agents/list/ai-agent-list-page';

export const Route = createFileRoute('/agents/')({
  staticData: {
    title: 'AI Agents',
    icon: AIIcon,
  },
  loader: async ({ context: { queryClient, dataplaneTransport } }) => {
    await queryClient.ensureQueryData(
      createQueryOptions(listAIAgents, create(ListAIAgentsRequestSchema, { pageSize: 50 }), {
        transport: dataplaneTransport,
      })
    );
  },
  component: AIAgentsListPage,
});
