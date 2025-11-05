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
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { McpServerStateBadge } from 'components/ui/mcp/mcp-server-state-badge';
import { useGetMCPServerQuery } from 'react-query/api/remote-mcp';
import { useParams } from 'react-router-dom';

import { RemoteMCPToggleButton } from './remote-mcp-toggle-button';
import { RemoteMCPBackButton } from '../remote-mcp-back-button';

export const RemoteMCPDetailsHeader = () => {
  const { id } = useParams<{ id: string }>();
  const { data: mcpServerData } = useGetMCPServerQuery({ id: id || '' }, { enabled: !!id });

  if (!mcpServerData?.mcpServer) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <RemoteMCPBackButton />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-4">
          <Heading level={1}>{mcpServerData.mcpServer.displayName}</Heading>
          <McpServerStateBadge />
          <RemoteMCPToggleButton />
        </div>
        <Text variant="lead">{mcpServerData.mcpServer.description}</Text>
      </div>
    </div>
  );
};
