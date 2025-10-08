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
import { List, ListItem, Text } from 'components/redpanda-ui/components/typography';
import { config } from 'config';
import { Cable, FileJson, Plus, Send } from 'lucide-react';

import ManusLogo from '../../../../../assets/manus.svg';
import { InstallRpkListItem } from '../install-rpk-list-item';
import { LoginToRpkListItem } from '../login-to-rpk-list-item';
import { ClientType, getClientConfig, getMCPServerName, type MCPServer } from '../utils';

type ClientManusProps = {
  mcpServer: MCPServer;
};

export const ClientManus = ({ mcpServer }: ClientManusProps) => {
  const clusterId = config?.clusterId;
  const mcpServerId = mcpServer?.id;
  const mcpServerName = getMCPServerName(mcpServer?.displayName ?? '');

  const manusConfigJson = getClientConfig(ClientType.MANUS, {
    mcpServerName,
    clusterId,
    mcpServerId,
    isServerless: config.isServerless,
  });

  return (
    <div>
      <div className="flex flex-col gap-4">
        <List className="my-0" ordered>
          <InstallRpkListItem />
          <LoginToRpkListItem />
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Open</span>
              <Text as="span" className="inline-flex items-center gap-1 whitespace-nowrap font-bold">
                <img alt="Manus" className="h-4 w-4" src={ManusLogo} />
                Manus
              </Text>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <Text>Go to</Text>
              <Text as="span" className="inline-flex items-center gap-1 whitespace-nowrap font-bold">
                <Cable className="h-4 w-4" /> Connect Apps
              </Text>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Select</span>
              <Text as="span" className="inline-flex items-center gap-1 whitespace-nowrap font-bold">
                <Plus className="h-4 w-4" />
                Add Connectors
              </Text>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Choose</span>
              <Text as="span" className="inline-flex items-center gap-1 whitespace-nowrap font-bold">
                <Plus className="h-4 w-4" />
                Custom MCP
              </Text>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Select</span>
              <Text as="span" className="inline-flex items-center gap-1 whitespace-nowrap font-bold">
                <FileJson className="h-4 w-4" /> Import by JSON
              </Text>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Copy and paste the following configuration:</span>
            </div>
            <DynamicCodeBlock code={manusConfigJson} lang="json" />
          </ListItem>
          <ListItem>
            <div className="flex items-center gap-2">
              Click{' '}
              <Text as="span" className="font-bold">
                Import
              </Text>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Click</span>
              <Text as="span" className="inline-flex items-center gap-1 whitespace-nowrap font-bold">
                <Send className="h-4 w-4" /> Try it out
              </Text>
            </div>
          </ListItem>
          <ListItem>
            Authenticate by running this command in your terminal:
            <DynamicCodeBlock code="rpk cloud login --no-browser" lang="bash" />
          </ListItem>
          <ListItem>
            Finally, test the connection by listing available tools:
            <DynamicCodeBlock code={`manus-mcp-cli tool list --server ${mcpServerName}`} lang="bash" />
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Alternatively, you can use a prompt:</span>
            </div>
            <DynamicCodeBlock
              code={`Help me test the ${mcpServerName} connector and show me how to use its feature (e.g. show any data you fetched with it). Do not forget to rpk cloud login initially. Give me a brief about its capabilities.`}
              lang="text"
            />
          </ListItem>
        </List>
      </div>
    </div>
  );
};
