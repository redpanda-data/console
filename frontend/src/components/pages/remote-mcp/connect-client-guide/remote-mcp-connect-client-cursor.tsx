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
import CursorLogo from '../../../../assets/cursor.svg';
import { createMCPConfig, getRpkCloudEnvironment, type MCPServer } from './utils';

interface RemoteMCPConnectClientCursorProps {
  mcpServer: MCPServer;
}

export const RemoteMCPConnectClientCursor = ({ mcpServer }: RemoteMCPConnectClientCursorProps) => {
  const clusterId = config?.clusterId;
  const mcpServerId = mcpServer?.id;
  const mcpServerName = mcpServer?.displayName ?? '';

  const cursorConfig = createMCPConfig({
    mcpServerName,
    clusterId,
    mcpServerId,
  });

  const cursorCommand = `cursor --add-mcp '${JSON.stringify(cursorConfig)}'`;

  const handleAddToCursor = () => {
    const cursorLink = `https://cursor.com/en/install-mcp?name=${mcpServerName}&config=${btoa(JSON.stringify(cursorConfig))}`;
    window.open(cursorLink, '_blank');
  };

  const cursorConfigJson = `{
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
          "--cluster-id",
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
      <Button variant="outline" onClick={handleAddToCursor}>
        <img src={CursorLogo} alt="Cursor" className="w-4 h-4 mr-2" />
        Add to Cursor
      </Button>
      <div className="flex flex-col gap-2">
        <Text>You can also run the following command:</Text>
        <DynamicCodeBlock lang="bash" code={cursorCommand} />
        <Text>
          Alternatively, update <InlineCode>~/.cursor/mcp.json</InlineCode> with:
        </Text>
        <DynamicCodeBlock lang="json" code={cursorConfigJson} />
      </div>
    </div>
  );
};
