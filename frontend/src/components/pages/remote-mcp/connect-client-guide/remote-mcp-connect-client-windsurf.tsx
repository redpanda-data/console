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

import { DynamicCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { InlineCode, Text } from 'components/redpanda-ui/components/typography';
import { config } from 'config';
import { getRpkCloudEnvironment, type MCPServer } from './utils';

interface RemoteMCPConnectClientWindsurfProps {
  mcpServer: MCPServer;
}

export const RemoteMCPConnectClientWindsurf = ({ mcpServer }: RemoteMCPConnectClientWindsurfProps) => {
  const clusterId = config?.clusterId;
  const mcpServerName = mcpServer?.displayName ?? '';
  const clusterFlag = config.isServerless ? '--serverless-cluster-id' : '--cluster-id';

  const windsurfConfig = {
    mcpServers: {
      [mcpServerName]: {
        command: 'rpk',
        args: [
          '-X',
          `cloud_environment=${getRpkCloudEnvironment()}`,
          'cloud',
          'mcp',
          'proxy',
          clusterFlag,
          `${clusterId}`,
          '--mcp-server-id',
          mcpServer?.id,
        ],
      },
    },
  };

  const windsurfConfigJson = JSON.stringify(windsurfConfig, null, 2);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <Text>
          Update <InlineCode>~/.codeium/windsurf/mcp_config.json</InlineCode> with:
        </Text>
        <DynamicCodeBlock lang="json" code={windsurfConfigJson} />
      </div>
    </div>
  );
};
