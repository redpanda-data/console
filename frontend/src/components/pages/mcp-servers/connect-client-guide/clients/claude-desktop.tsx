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

import ClaudeDesktopLogo from '../../../../../assets/claude-desktop.svg';
import { RemoteMCPConnectDocsAlert } from '../../remote-mcp-connect-docs-alert';
import { InstallRpkListItem } from '../install-rpk-list-item';
import { LoginToRpkListItem } from '../login-to-rpk-list-item';
import { ClientType, getClientConfig, getMCPServerName, getRpkCommand, type MCPServer } from '../utils';

type ClientClaudeDesktopProps = {
  mcpServer: MCPServer;
};

export const ClientClaudeDesktop = ({ mcpServer }: ClientClaudeDesktopProps) => {
  const clusterId = config?.clusterId;
  const mcpServerId = mcpServer?.id;
  const mcpServerName = getMCPServerName(mcpServer?.displayName ?? '');

  const claudeDesktopCommand = getRpkCommand({
    clusterId,
    mcpServerId,
    clientType: 'claude',
    isServerless: config.isServerless,
  });

  const claudeDesktopConfigJson = getClientConfig(ClientType.CLAUDE_DESKTOP, {
    mcpServerName,
    clusterId,
    mcpServerId,
    isServerless: config.isServerless,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <List className="my-0" ordered>
          <InstallRpkListItem />
          <LoginToRpkListItem />
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>In</span>
              <Text as="span" className="inline-flex items-center gap-1 whitespace-nowrap font-bold">
                <img alt="Claude Desktop" className="h-4 w-4" src={ClaudeDesktopLogo} />
                Claude Desktop
              </Text>
              <span>, run the following command to configure the MCP server:</span>
            </div>
            <DynamicCodeBlock code={claudeDesktopCommand} lang="bash" />
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Alternatively, you can manually update</span>
              <InlineCode className="whitespace-nowrap">Claude/claude_desktop_config.json</InlineCode>
              <span>with:</span>
            </div>
            <DynamicCodeBlock code={claudeDesktopConfigJson} lang="json" />
          </ListItem>
          <ListItem>Restart Claude Desktop and verify the MCP server is available for use.</ListItem>
        </List>
      </div>
      <RemoteMCPConnectDocsAlert
        clientName="Claude Desktop"
        documentationUrl="https://support.anthropic.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop"
      />
    </div>
  );
};
