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
import { InlineCode, List, ListItem, Text } from 'components/redpanda-ui/components/typography';
import { config } from 'config';
import ClaudeDesktopLogo from '../../../../assets/claude-desktop.svg';
import { RemoteMCPConnectDocsAlert } from '../remote-mcp-connect-docs-alert';
import { InstallRpkListItem } from './install-rpk-list-item';
import { LoginToRpkListItem } from './login-to-rpk-list-item';
import { getMCPServerName, getRpkCloudEnvironment, getRpkCommand, type MCPServer } from './utils';

interface RemoteMCPConnectClientClaudeDesktopProps {
  mcpServer: MCPServer;
}

export const RemoteMCPConnectClientClaudeDesktop = ({ mcpServer }: RemoteMCPConnectClientClaudeDesktopProps) => {
  const clusterId = config?.clusterId;
  const mcpServerId = mcpServer?.id;
  const mcpServerName = getMCPServerName(mcpServer?.displayName ?? '');

  const claudeDesktopCommand = getRpkCommand({
    clusterId,
    mcpServerId,
    clientType: 'claude',
    isServerless: config.isServerless,
  });

  const clusterFlag = config.isServerless ? '--serverless-cluster-id' : '--cluster-id';
  const showCloudEnvironmentFlag = getRpkCloudEnvironment() !== 'production';

  const claudeDesktopConfigJson = showCloudEnvironmentFlag
    ? `{
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
          "${clusterFlag}",
          "${clusterId}",
          "--mcp-server-id",
          "${mcpServerId}"
        ]
      }
    }
  }
}`
    : `{
  "mcp": {
    "servers": {
      "${mcpServerName}": {
        "command": "rpk",
        "args": [
          "-X",
          "cloud",
          "mcp",
          "proxy",
          "${clusterFlag}",
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
      <div className="flex flex-col gap-4">
        <List ordered className="my-0">
          <InstallRpkListItem />
          <LoginToRpkListItem />
          <ListItem>
            <div className="flex items-center gap-1">
              In <img src={ClaudeDesktopLogo} alt="Claude Desktop" className="h-4 w-4" />
              <Text as="span" className="font-bold">
                Claude Desktop
              </Text>
              , run the following command to configure the MCP server:
            </div>
            <DynamicCodeBlock lang="bash" code={claudeDesktopCommand} />
          </ListItem>
          <ListItem>
            <div className="flex items-center gap-2">
              Alternatively, you can manually update <InlineCode>Claude/claude_desktop_config.json</InlineCode> with:
            </div>
            <DynamicCodeBlock lang="json" code={claudeDesktopConfigJson} />
          </ListItem>
          <ListItem>Restart Claude Desktop and verify the MCP server is available for use.</ListItem>
        </List>
      </div>
      <RemoteMCPConnectDocsAlert
        documentationUrl="https://support.anthropic.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop"
        clientName="Claude Desktop"
      />
    </div>
  );
};
