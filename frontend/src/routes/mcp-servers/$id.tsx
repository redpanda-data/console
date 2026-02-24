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
import { GetMCPServerRequestSchema } from 'protogen/redpanda/api/dataplane/v1/mcp_pb';
import { getMCPServer } from 'protogen/redpanda/api/dataplane/v1/mcp-MCPServerService_connectquery';
import { z } from 'zod';

import { RemoteMCPDetailsPage } from '../../components/pages/mcp-servers/details/remote-mcp-details-page';

const searchSchema = z.object({
  tab: fallback(z.string().optional(), undefined),
});

function MCPServerNotFound() {
  const { id } = useParams({ from: '/mcp-servers/$id' });
  return (
    <NotFoundContent
      backLink="/mcp-servers"
      backLinkText="Back to MCP Servers"
      resourceId={id}
      resourceType="MCP Server"
    />
  );
}

export const Route = createFileRoute('/mcp-servers/$id')({
  staticData: {
    title: 'Remote MCP Details',
  },
  validateSearch: zodValidator(searchSchema),
  loader: async ({ context: { queryClient, dataplaneTransport }, params: { id } }) => {
    try {
      await queryClient.ensureQueryData(
        createQueryOptions(getMCPServer, create(GetMCPServerRequestSchema, { id }), {
          transport: dataplaneTransport,
        })
      );
    } catch (error) {
      if (error instanceof ConnectError && error.code === Code.NotFound) {
        throw notFound();
      }
      throw error;
    }
  },
  notFoundComponent: MCPServerNotFound,
  component: RemoteMCPDetailsPage,
});
