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
import { getMCPServerName, getRpkCloudEnvironment, type MCPServer } from '../utils';

interface ClientManusProps {
  mcpServer: MCPServer;
}

export const ClientManus = ({ mcpServer }: ClientManusProps) => {
  const clusterId = config?.clusterId;
  const mcpServerId = mcpServer?.id;
  const mcpServerName = getMCPServerName(mcpServer?.displayName ?? '');

  const clusterFlag = config.isServerless ? '--serverless-cluster-id' : '--cluster-id';
  const showCloudEnvironmentFlag = getRpkCloudEnvironment() !== 'production';

  const manusConfigJson = showCloudEnvironmentFlag
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
    <div>
      <div className="flex flex-col gap-4">
        <List ordered className="my-0">
          <InstallRpkListItem />
          <LoginToRpkListItem />
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Open</span>
              <Text as="span" className="font-bold inline-flex items-center gap-1 whitespace-nowrap">
                <img src={ManusLogo} alt="Manus" className="h-4 w-4" />
                Manus
              </Text>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <Text>Go to</Text>
              <Text as="span" className="font-bold inline-flex items-center gap-1 whitespace-nowrap">
                <Cable className="h-4 w-4" /> Connect Apps
              </Text>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Select</span>
              <Text as="span" className="font-bold inline-flex items-center gap-1 whitespace-nowrap">
                <Plus className="h-4 w-4" />
                Add Connectors
              </Text>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Choose</span>
              <Text as="span" className="font-bold inline-flex items-center gap-1 whitespace-nowrap">
                <Plus className="h-4 w-4" />
                Custom MCP
              </Text>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Select</span>
              <Text as="span" className="font-bold inline-flex items-center gap-1 whitespace-nowrap">
                <FileJson className="h-4 w-4" /> Import by JSON
              </Text>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Copy and paste the following configuration:</span>
            </div>
            <DynamicCodeBlock lang="json" code={manusConfigJson} />
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
              <Text as="span" className="font-bold inline-flex items-center gap-1 whitespace-nowrap">
                <Send className="h-4 w-4" /> Try it out
              </Text>
            </div>
          </ListItem>
          <ListItem>
            Authenticate by running this command in your terminal:
            <DynamicCodeBlock lang="bash" code="rpk cloud login --no-browser" />
          </ListItem>
          <ListItem>
            Finally, test the connection by listing available tools:
            <DynamicCodeBlock lang="bash" code={`manus-mcp-cli tool list --server ${mcpServerName}`} />
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Alternatively, you can use a prompt:</span>
            </div>
            <DynamicCodeBlock
              lang="text"
              code={`Help me test the ${mcpServerName} connector and show me how to use its feature (e.g. show any data you fetched with it). Do not forget to rpk cloud login initially. Give me a brief about its capabilities.`}
            />
          </ListItem>
        </List>
      </div>
    </div>
  );
};
