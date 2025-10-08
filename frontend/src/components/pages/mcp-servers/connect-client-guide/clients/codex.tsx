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

import CodexLogo from '../../../../../assets/codex.svg';
import { RemoteMCPConnectDocsAlert } from '../../remote-mcp-connect-docs-alert';
import { InstallRpkListItem } from '../install-rpk-list-item';
import { LoginToRpkListItem } from '../login-to-rpk-list-item';
import { ClientType, getClientCommand, getClientConfig, getMCPServerName, type MCPServer } from '../utils';

type ClientCodexProps = {
  mcpServer: MCPServer;
};

export const ClientCodex = ({ mcpServer }: ClientCodexProps) => {
  const mcpServerName = getMCPServerName(mcpServer?.displayName ?? '');
  const clusterId = config?.clusterId;
  const mcpServerId = mcpServer?.id;

  const codexMcpAddCommand = getClientCommand(ClientType.CODEX, {
    mcpServerName,
    clusterId,
    mcpServerId,
    isServerless: config.isServerless,
  });

  const codexConfigToml = getClientConfig(ClientType.CODEX, {
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
                <img alt="Codex" className="h-4 w-4" src={CodexLogo} />
                Codex
              </Text>
              <span>, add the MCP server using the following command:</span>
            </div>
            <DynamicCodeBlock code={codexMcpAddCommand} lang="bash" />
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Alternatively, update</span>
              <InlineCode className="whitespace-nowrap">~/.codex/config.toml</InlineCode>
              <span>with:</span>
            </div>
            <DynamicCodeBlock code={codexConfigToml} lang="toml" />
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Run Codex and check</span>
              <InlineCode className="whitespace-nowrap">/mcp</InlineCode>
              <span>to verify the MCP server is connected and available.</span>
            </div>
          </ListItem>
        </List>
      </div>
      <RemoteMCPConnectDocsAlert
        clientName="Codex"
        documentationUrl="https://github.com/openai/codex/blob/main/docs/config.md#mcp_servers"
      />
    </div>
  );
};
