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
import { getRpkCloudEnvironment, getRpkCommand, type MCPServer } from './utils';

interface RemoteMCPConnectClientClaudeDesktopProps {
  mcpServer: MCPServer;
}

export const RemoteMCPConnectClientClaudeDesktop = ({ mcpServer }: RemoteMCPConnectClientClaudeDesktopProps) => {
  const clusterId = config?.clusterId;
  const mcpServerId = mcpServer?.id;
  const mcpServerName = mcpServer?.displayName ?? '';

  const claudeDesktopCommand = getRpkCommand({
    clusterId,
    mcpServerId,
    clientType: 'claude',
  });

  const claudeDesktopConfigJson = `{
  "mcp": {
    "servers": {
      "${mcpServerName}": {
        "command": "rpk",
        "args": [
          "-X",
          "cloud_environment=${getRpkCloudEnvironment()}",
          "cloud",
          "mcp",
          "proxy",
          "--cluster-id",
          "${clusterId}",
          "--mcp-server-id",
          "${mcpServerId}"
        ]
      }
    }
  }
}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <DynamicCodeBlock lang="bash" code={claudeDesktopCommand} />
        <Text>
          Alternatively, update <InlineCode>Claude/claude_desktop_config.json</InlineCode> with:
        </Text>
        <DynamicCodeBlock lang="json" code={claudeDesktopConfigJson} />
      </div>
    </div>
  );
};
