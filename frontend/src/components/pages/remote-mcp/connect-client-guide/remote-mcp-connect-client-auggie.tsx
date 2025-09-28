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
import AuggieLogo from '../../../../assets/auggie.svg';
import { RemoteMCPConnectDocsAlert } from '../remote-mcp-connect-docs-alert';
import { InstallRpkListItem } from './install-rpk-list-item';
import { LoginToRpkListItem } from './login-to-rpk-list-item';
import { getMCPServerName, getRpkCloudEnvironment, type MCPServer } from './utils';

interface RemoteMCPConnectClientAuggieProps {
  mcpServer: MCPServer;
}

export const RemoteMCPConnectClientAuggie = ({ mcpServer }: RemoteMCPConnectClientAuggieProps) => {
  const clusterId = config?.clusterId;
  const mcpServerId = mcpServer?.id;
  const mcpServerName = getMCPServerName(mcpServer?.displayName ?? '');

  const clusterFlag = config.isServerless ? '--serverless-cluster-id' : '--cluster-id';

  const showCloudEnvironmentFlag = getRpkCloudEnvironment() !== 'production';

  const cloudEnvArg = showCloudEnvironmentFlag ? `"cloud_environment=${getRpkCloudEnvironment()}" ` : '';
  const auggieCommand = `auggie mcp add ${mcpServerName} \\
--transport stdio \\
--command rpk \\
--args "-X" ${cloudEnvArg}\\
"cloud" "mcp" "proxy" \\
"${clusterFlag}" "${clusterId}" \\
"--mcp-server-id" "${mcpServerId}"`;

  const augmentCodeConfigJson = showCloudEnvironmentFlag
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
                <img src={AuggieLogo} alt="Auggie (Augment Code) CLI" className="h-4 w-4" /> Auggie (Augment Code CLI)
              </Text>
              <span>and run the following command:</span>
            </div>
            <DynamicCodeBlock lang="bash" code={auggieCommand} />
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Alternatively, you can manually update</span>
              <InlineCode className="whitespace-nowrap">~/.augment/mcp.json</InlineCode>
              <span>with the following MCP server configuration:</span>
            </div>
            <DynamicCodeBlock lang="json" code={augmentCodeConfigJson} />
          </ListItem>
          <ListItem>
            Verify the MCP server is available with:
            <DynamicCodeBlock lang="bash" code="auggie mcp list" />
            Or alternatively use:
            <DynamicCodeBlock lang="bash" code="/mcp-status" />
          </ListItem>
        </List>
      </div>
      <RemoteMCPConnectDocsAlert
        documentationUrl="https://docs.augmentcode.com/setup-augment/mcp#import-from-json"
        clientName="Auggie"
      />
    </div>
  );
};
