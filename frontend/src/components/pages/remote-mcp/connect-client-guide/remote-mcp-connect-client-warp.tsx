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
import WarpLogo from '../../../../assets/warp.svg';
import { RemoteMCPConnectDocsAlert } from '../remote-mcp-connect-docs-alert';
import { InstallRpkListItem } from './install-rpk-list-item';
import { LoginToRpkListItem } from './login-to-rpk-list-item';
import { getMCPServerName, getRpkCloudEnvironment, type MCPServer } from './utils';

interface RemoteMCPConnectClientWarpProps {
  mcpServer: MCPServer;
}

export const RemoteMCPConnectClientWarp = ({ mcpServer }: RemoteMCPConnectClientWarpProps) => {
  const clusterId = config?.clusterId;
  const mcpServerId = mcpServer?.id;
  const mcpServerName = getMCPServerName(mcpServer?.displayName ?? '');

  const clusterFlag = config.isServerless ? '--serverless-cluster-id' : '--cluster-id';
  const showCloudEnvironmentFlag = getRpkCloudEnvironment() !== 'production';

  const warpConfigJson = showCloudEnvironmentFlag
    ? `{
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
}`
    : `{
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
}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <List ordered className="my-0">
          <InstallRpkListItem />
          <LoginToRpkListItem />
          <ListItem>
            <div className="flex items-center gap-2">
              Open{' '}
              <Text as="span" className="font-bold inline-flex items-center gap-1">
                <img src={WarpLogo} alt="Warp" className="h-4 w-4" /> Warp
              </Text>{' '}
              and go to{' '}
              <Text as="span" className="font-bold">
                Settings → AI → Manage MCP servers
              </Text>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex items-center gap-2">
              Alternatively, use the <InlineCode>/add-mcp</InlineCode> command in Warp
            </div>
          </ListItem>
          <ListItem>
            <div className="flex items-center gap-2">Copy and paste the following configuration:</div>
            <DynamicCodeBlock lang="json" code={warpConfigJson} />
          </ListItem>
          <ListItem>
            Verify the MCP server is available with:
            <DynamicCodeBlock lang="bash" code="/view-mcp" />
          </ListItem>
        </List>
      </div>
      <RemoteMCPConnectDocsAlert
        documentationUrl="https://docs.warp.dev/knowledge-and-collaboration/mcp"
        clientName="Warp"
      />
    </div>
  );
};
