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

import { getRouteApi } from '@tanstack/react-router';

const routeApi = getRouteApi('/mcp-servers/$id');

import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { McpServerStateBadge } from 'components/ui/mcp/mcp-server-state-badge';
import { useGetMCPServerQuery } from 'react-query/api/remote-mcp';

import { RemoteMCPToggleButton } from './remote-mcp-toggle-button';

export const RemoteMCPDetailsHeader = () => {
  const { id } = routeApi.useParams();
  const { data: mcpServerData } = useGetMCPServerQuery({ id: id || '' }, { enabled: !!id });

  if (!mcpServerData?.mcpServer) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <Heading level={1}>{mcpServerData.mcpServer.displayName}</Heading>
        <McpServerStateBadge />
        <RemoteMCPToggleButton />
      </div>
      <Text variant="lead">{mcpServerData.mcpServer.description}</Text>
    </div>
  );
};
