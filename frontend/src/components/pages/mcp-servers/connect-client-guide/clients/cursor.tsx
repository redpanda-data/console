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

import CursorLogo from '../../../../../assets/cursor.svg';
import { RemoteMCPConnectDocsAlert } from '../../remote-mcp-connect-docs-alert';
import { InstallRpkListItem } from '../install-rpk-list-item';
import { LoginToRpkListItem } from '../login-to-rpk-list-item';
import { ClientType, createMCPConfig, getClientConfig, getMCPServerName, type MCPServer } from '../utils';

type ClientCursorProps = {
  mcpServer: MCPServer;
};

export const ClientCursor = ({ mcpServer }: ClientCursorProps) => {
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

  const cursorConfigJson = getClientConfig(ClientType.CURSOR, {
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
              <span>Click the button below to add MCP server to</span>
              <Text as="span" className="inline-flex items-center gap-1 whitespace-nowrap font-bold">
                <img alt="Cursor" className="h-4 w-4" src={CursorLogo} /> Cursor
              </Text>
            </div>
            <Button className="mt-2" onClick={handleAddToCursor} variant="outline">
              <img alt="Cursor" className="h-4 w-4" src={CursorLogo} />
              Add to Cursor
            </Button>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Alternatively, run the following command:</span>
            </div>
            <DynamicCodeBlock code={cursorCommand} lang="bash" />
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <div className="inline-flex items-center gap-1 whitespace-nowrap">
                <Kbd>
                  <Command className="h-4 w-4" />
                </Kbd>
                /<Kbd>Ctrl</Kbd> + <Kbd>Shift</Kbd> + <Kbd>P</Kbd>
              </div>
              <span>to open the</span>
              <Text as="span" className="font-bold">
                Command Palette → Settings → Cursor Settings → MCP → Add a Custom MCP Server
              </Text>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>You can also manually update</span>
              <InlineCode className="whitespace-nowrap">~/.cursor/mcp.json</InlineCode>
              <span>with:</span>
            </div>
            <DynamicCodeBlock code={cursorConfigJson} lang="json" />
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Run</span>
              <InlineCode className="whitespace-nowrap">cursor</InlineCode>
              <span>and</span>
              <InlineCode className="whitespace-nowrap">/mcp list</InlineCode>
              <span>to list available MCP servers. Approve the new MCP server when prompted.</span>
            </div>
          </ListItem>
          <ListItem>
            Finally, authenticate against the MCP server:
            <DynamicCodeBlock code={`cursor-agent mcp login ${mcpServerName}`} lang="bash" />
          </ListItem>
        </List>
      </div>
      <RemoteMCPConnectDocsAlert
        clientName="Cursor"
        documentationUrl="https://docs.cursor.com/en/context/mcp#using-mcp-json"
      />
    </div>
  );
};
