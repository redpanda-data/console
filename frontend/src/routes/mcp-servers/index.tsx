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
import { WrenchIcon } from 'components/icons';
import { ListMCPServersRequestSchema } from 'protogen/redpanda/api/dataplane/v1/mcp_pb';
import { listMCPServers } from 'protogen/redpanda/api/dataplane/v1/mcp-MCPServerService_connectquery';

import { RemoteMCPListPage } from '../../components/pages/mcp-servers/list/remote-mcp-list-page';

export const Route = createFileRoute('/mcp-servers/')({
  staticData: {
    title: 'MCP Servers',
    icon: WrenchIcon,
  },
  loader: async ({ context: { queryClient, dataplaneTransport } }) => {
    await queryClient.ensureQueryData(
      createQueryOptions(listMCPServers, create(ListMCPServersRequestSchema, { pageSize: 50 }), {
        transport: dataplaneTransport,
      })
    );
  },
  component: RemoteMCPListPage,
});
