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
import { Kbd } from 'components/redpanda-ui/components/kbd';
import { InlineCode, List, ListItem, Text } from 'components/redpanda-ui/components/typography';
import { config } from 'config';
import { Command } from 'lucide-react';
import CursorLogo from '../../../../assets/cursor.svg';
import { RemoteMCPConnectDocsAlert } from '../remote-mcp-connect-docs-alert';
import { InstallRpkListItem } from './install-rpk-list-item';
import { LoginToRpkListItem } from './login-to-rpk-list-item';
import { createMCPConfig, getMCPServerName, getRpkCloudEnvironment, type MCPServer } from './utils';

interface RemoteMCPConnectClientCursorProps {
  mcpServer: MCPServer;
}

export const RemoteMCPConnectClientCursor = ({ mcpServer }: RemoteMCPConnectClientCursorProps) => {
  const clusterId = config?.clusterId;
  const mcpServerId = mcpServer?.id;
  const mcpServerName = getMCPServerName(mcpServer?.displayName ?? '');

  const cursorConfig = createMCPConfig({
    mcpServerName,
    clusterId,
    mcpServerId,
    isServerless: config.isServerless,
  });

  const cursorCommand = `cursor --add-mcp \\
'${JSON.stringify(cursorConfig)}'`;

  const handleAddToCursor = () => {
    const cursorLink = `https://cursor.com/en/install-mcp?name=${mcpServerName}&config=${btoa(JSON.stringify(cursorConfig))}`;
    window.open(cursorLink, '_blank');
  };

  const clusterFlag = config.isServerless ? '--serverless-cluster-id' : '--cluster-id';
  const showCloudEnvironmentFlag = getRpkCloudEnvironment() !== 'production';

  const cursorConfigJson = showCloudEnvironmentFlag
    ? `{
  "mcpServers": {
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
}`
    : `{
  "mcpServers": {
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
}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <List ordered className="my-0">
          <InstallRpkListItem />
          <LoginToRpkListItem />
          <ListItem>
            <div className="flex items-center gap-2">
              Click the button below to add MCP server to{' '}
              <Text as="span" className="font-bold inline-flex items-center gap-1">
                <img src={CursorLogo} alt="Cursor" className="h-4 w-4" /> Cursor
              </Text>
            </div>
            <Button variant="outline" onClick={handleAddToCursor} className="mt-2">
              <img src={CursorLogo} alt="Cursor" className="w-4 h-4 mr-2" />
              Add to Cursor
            </Button>
          </ListItem>
          <ListItem>
            <div className="flex items-center gap-2">Alternatively, run the following command:</div>
            <DynamicCodeBlock lang="bash" code={cursorCommand} />
          </ListItem>
          <ListItem>
            <div className="flex items-center gap-2">
              <Kbd>
                <Command className="h-4 w-4" />
              </Kbd>
              /<Kbd>Ctrl</Kbd> + <Kbd>Shift</Kbd> + <Kbd>P</Kbd> to open the{' '}
              <Text as="span" className="font-bold">
                Command Palette → Settings → Cursor Settings → MCP → Add a Custom MCP Server
              </Text>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex items-center gap-2">
              You can also manually update <InlineCode>~/.cursor/mcp.json</InlineCode> with:
            </div>
            <DynamicCodeBlock lang="json" code={cursorConfigJson} />
          </ListItem>
          <ListItem>
            Run <InlineCode>cursor</InlineCode> and <InlineCode>/mcp list</InlineCode> to list available MCP servers.
            Approve the new MCP server when prompted.
          </ListItem>
          <ListItem>
            Finally, authenticate against the MCP server:
            <DynamicCodeBlock lang="bash" code={`cursor-agent mcp login ${mcpServerName}`} />
          </ListItem>
        </List>
      </div>
      <RemoteMCPConnectDocsAlert
        documentationUrl="https://docs.cursor.com/en/context/mcp#using-mcp-json"
        clientName="Cursor"
      />
    </div>
  );
};
