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
import { InlineCode, Text } from 'components/redpanda-ui/components/typography';
import { config } from 'config';
import VSCodeLogo from '../../../../assets/vscode.svg';
import { createMCPConfig, getRpkCloudEnvironment, type MCPServer } from './utils';

interface RemoteMCPConnectClientVSCodeProps {
  mcpServer: MCPServer;
}

export const RemoteMCPConnectClientVSCode = ({ mcpServer }: RemoteMCPConnectClientVSCodeProps) => {
  const clusterId = config?.clusterId;
  const mcpServerId = mcpServer?.id;
  const mcpServerName = mcpServer?.displayName ?? '';

  const vscodeConfig = createMCPConfig({
    mcpServerName,
    clusterId,
    mcpServerId,
    isServerless: config.isServerless,
  });

  const vscodeCommand = `code --add-mcp '${JSON.stringify(vscodeConfig)}'`;

  const handleAddToVSCode = () => {
    const vscodeLink = `vscode:mcp/install?${encodeURIComponent(JSON.stringify(vscodeConfig))}`;
    window.open(vscodeLink, '_blank');
  };

  const clusterFlag = config.isServerless ? '--serverless-cluster-id' : '--cluster-id';
  const vscodeConfigJson = `{
  "mcp": {
    "servers": {
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
  }
}`;

  return (
    <div className="space-y-4">
      <Button variant="outline" onClick={handleAddToVSCode}>
        <img src={VSCodeLogo} alt="VSCode" className="w-4 h-4 mr-2" />
        Add to VSCode
      </Button>
      <div className="flex flex-col gap-2">
        <Text>You can also run the following command:</Text>
        <DynamicCodeBlock lang="bash" code={vscodeCommand} />
        <Text>
          Alternatively, update <InlineCode>~/.vscode/mcp.json</InlineCode> with:
        </Text>
        <DynamicCodeBlock lang="json" code={vscodeConfigJson} />
      </div>
    </div>
  );
};
