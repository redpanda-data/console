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

import WarpLogo from '../../../../../assets/warp.svg';
import { RemoteMCPConnectDocsAlert } from '../../remote-mcp-connect-docs-alert';
import { InstallRpkListItem } from '../install-rpk-list-item';
import { LoginToRpkListItem } from '../login-to-rpk-list-item';
import { getMCPServerName, getRpkCloudEnvironment, type MCPServer } from '../utils';

type ClientWarpProps = {
  mcpServer: MCPServer;
};

export const ClientWarp = ({ mcpServer }: ClientWarpProps) => {
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
        <List className="my-0" ordered>
          <InstallRpkListItem />
          <LoginToRpkListItem />
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Open</span>
              <Text as="span" className="inline-flex items-center gap-1 whitespace-nowrap font-bold">
                <img alt="Warp" className="h-4 w-4" src={WarpLogo} /> Warp
              </Text>
              <span>and go to</span>
              <Text as="span" className="whitespace-nowrap font-bold">
                Settings → AI → Manage MCP servers
              </Text>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Alternatively, use the</span>
              <InlineCode className="whitespace-nowrap">/add-mcp</InlineCode>
              <span>command in Warp</span>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Copy and paste the following configuration:</span>
            </div>
            <DynamicCodeBlock code={warpConfigJson} lang="json" />
          </ListItem>
          <ListItem>
            Verify the MCP server is available with:
            <DynamicCodeBlock code="/view-mcp" lang="bash" />
          </ListItem>
        </List>
      </div>
      <RemoteMCPConnectDocsAlert
        clientName="Warp"
        documentationUrl="https://docs.warp.dev/knowledge-and-collaboration/mcp"
      />
    </div>
  );
};
