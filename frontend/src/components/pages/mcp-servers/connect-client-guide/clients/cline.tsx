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
import { Server, Settings } from 'lucide-react';

import ClineLogo from '../../../../../assets/cline.svg';
import { RemoteMCPConnectDocsAlert } from '../../remote-mcp-connect-docs-alert';
import { InstallRpkListItem } from '../install-rpk-list-item';
import { LoginToRpkListItem } from '../login-to-rpk-list-item';
import { getMCPServerName, getRpkCloudEnvironment, type MCPServer } from '../utils';

interface ClientClineProps {
  mcpServer: MCPServer;
}

export const ClientCline = ({ mcpServer }: ClientClineProps) => {
  const clusterId = config?.clusterId;
  const mcpServerId = mcpServer?.id;
  const mcpServerName = getMCPServerName(mcpServer?.displayName ?? '');

  const clusterFlag = config.isServerless ? '--serverless-cluster-id' : '--cluster-id';
  const showCloudEnvironmentFlag = getRpkCloudEnvironment() !== 'production';

  const clineConfigJson = showCloudEnvironmentFlag
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
            <div className="flex flex-wrap items-center gap-1">
              <span>Open</span>
              <Text as="span" className="font-bold inline-flex items-center gap-1 whitespace-nowrap">
                <img src={ClineLogo} alt="Cline" className="h-4 w-4" />
                Cline extension
              </Text>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <Text>Click on</Text>
              <Text as="span" className="font-bold inline-flex items-center gap-1 whitespace-nowrap">
                <Server className="h-4 w-4" />
                MCP Servers
              </Text>
              <Text>section at the bottom of the prompt window</Text>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Click</span>
              <Text as="span" className="font-bold inline-flex items-center gap-1 whitespace-nowrap">
                <Settings className="h-4 w-4" />
                Configure MCP Servers
              </Text>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Add the following configuration to your</span>
              <InlineCode className="whitespace-nowrap">cline_mcp_settings.json</InlineCode>
            </div>
            <DynamicCodeBlock lang="json" code={clineConfigJson} />
          </ListItem>
          <ListItem>
            Press{' '}
            <Text as="span" className="font-bold">
              Done
            </Text>
          </ListItem>
          <ListItem>
            <div className="flex items-center gap-2">
              Cline will automatically reload and you can start using the MCP server
            </div>
          </ListItem>
        </List>
      </div>
      <RemoteMCPConnectDocsAlert documentationUrl="https://docs.cline.bot/mcp/mcp-overview" clientName="Cline" />
    </div>
  );
};
