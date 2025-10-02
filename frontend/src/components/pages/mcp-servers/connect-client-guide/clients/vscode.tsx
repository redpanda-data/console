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

import { Button } from 'components/redpanda-ui/components/button';
import { DynamicCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { InlineCode, List, ListItem, Text } from 'components/redpanda-ui/components/typography';
import { config } from 'config';
import VSCodeLogo from '../../../../../assets/vscode.svg';
import { RemoteMCPConnectDocsAlert } from '../../remote-mcp-connect-docs-alert';
import { InstallRpkListItem } from '../install-rpk-list-item';
import { LoginToRpkListItem } from '../login-to-rpk-list-item';
import { ClientType, createMCPConfig, getClientConfig, getMCPServerName, type MCPServer } from '../utils';

interface ClientVscodeProps {
  mcpServer: MCPServer;
  enableMcpDiscovery?: boolean;
}

export const ClientVscode = ({ mcpServer, enableMcpDiscovery = true }: ClientVscodeProps) => {
  const clusterId = config?.clusterId;
  const mcpServerId = mcpServer?.id;
  const mcpServerName = getMCPServerName(mcpServer?.displayName ?? '');

  const vscodeConfig = createMCPConfig({
    mcpServerName,
    clusterId,
    mcpServerId,
    isServerless: config.isServerless,
  });

  const vscodeCommand = `code --add-mcp \\
'${JSON.stringify(vscodeConfig)}'`;

  const handleAddToVSCode = () => {
    const vscodeLink = `vscode:mcp/install?${encodeURIComponent(JSON.stringify(vscodeConfig))}`;
    window.open(vscodeLink, '_blank');
  };

  const mcpDiscoveryConfig = enableMcpDiscovery
    ? `"chat.mcp.discovery.enabled": {
    "windsurf": true,
    "cursor-global": true,
    "cursor-workspace": true,
    "claude-desktop": true
}`
    : '';

  const vscodeConfigJson = getClientConfig(ClientType.VSCODE, {
    mcpServerName,
    clusterId,
    mcpServerId,
    isServerless: config.isServerless,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <List ordered className="my-0">
          <InstallRpkListItem />
          <LoginToRpkListItem />
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Click the button below to add MCP server to</span>
              <Text as="span" className="font-bold inline-flex items-center gap-1 whitespace-nowrap">
                <img src={VSCodeLogo} alt="VSCode" className="h-4 w-4" /> VSCode
              </Text>
            </div>
            <Button variant="outline" onClick={handleAddToVSCode} className="mt-2">
              <img src={VSCodeLogo} alt="VSCode" className="w-4 h-4" />
              Add to VSCode
            </Button>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>
                You can also set up autodiscovery for the MCP server from other IDEs by updating your VSCode settings:
              </span>
            </div>
            <DynamicCodeBlock lang="json" code={mcpDiscoveryConfig} />
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Alternatively, run the following command:</span>
            </div>
            <DynamicCodeBlock lang="bash" code={vscodeCommand} />
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>You can also manually update</span>
              <InlineCode className="whitespace-nowrap">~/.vscode/mcp.json</InlineCode>
              <span>with:</span>
            </div>
            <DynamicCodeBlock lang="json" code={vscodeConfigJson} />
          </ListItem>
          <ListItem>Restart VSCode and the MCP server should be available in the MCP panel.</ListItem>
        </List>
      </div>
      <RemoteMCPConnectDocsAlert
        documentationUrl="https://code.visualstudio.com/docs/copilot/customization/mcp-servers"
        clientName="VSCode"
      />
    </div>
  );
};
