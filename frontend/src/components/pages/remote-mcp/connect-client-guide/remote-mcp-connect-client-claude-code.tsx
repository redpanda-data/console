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
import { Label } from 'components/redpanda-ui/components/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { InlineCode, Text } from 'components/redpanda-ui/components/typography';
import { config } from 'config';
import { useState } from 'react';
import { getRpkCloudEnvironment, type MCPServer } from './utils';

interface RemoteMCPConnectClientClaudeCodeProps {
  mcpServer: MCPServer;
}

export const RemoteMCPConnectClientClaudeCode = ({ mcpServer }: RemoteMCPConnectClientClaudeCodeProps) => {
  const [selectedScope, setSelectedScope] = useState<string>('local');

  const clusterId = config?.clusterId;
  const mcpServerId = mcpServer?.id;
  const mcpServerName = mcpServer?.displayName ?? '';
  const clusterFlag = config.isServerless ? '--serverless-cluster-id' : '--cluster-id';

  const claudeCodeCommand = `claude mcp add-json ${mcpServerName} --scope ${selectedScope} \\
'{"type":"stdio","command":"rpk","args":[
"-X","cloud_environment=${getRpkCloudEnvironment()}","cloud","mcp","proxy",
"${clusterFlag}","${clusterId}",
"--mcp-server-id","${mcpServerId}"]}'`;

  const claudeCodeConfigJson = `{
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
      <div>
        <Label className="text-sm font-medium">Scope</Label>
        <div className="mt-2">
          <Select value={selectedScope} onValueChange={setSelectedScope}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Configuration Scope</SelectLabel>
                <SelectItem value="local">Local</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="project">Project</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-2">
          <Text variant="small" className="text-muted-foreground">
            {selectedScope === 'local' && 'Configuration stored locally for this project only'}
            {selectedScope === 'project' && (
              <Text as="span">
                Configuration shared with team via <InlineCode>.mcp.json</InlineCode> file in project
              </Text>
            )}
            {selectedScope === 'user' && (
              <Text as="span">
                Configuration available across all your projects in <InlineCode>~/.claude.json</InlineCode>
              </Text>
            )}
          </Text>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <DynamicCodeBlock lang="bash" code={claudeCodeCommand} />
        <Text>
          Alternatively, update {selectedScope === 'local' && <InlineCode>~/.claude.json</InlineCode>}
          {selectedScope === 'user' && <InlineCode>~/.claude.json</InlineCode>}
          {selectedScope === 'project' && <InlineCode>.mcp.json</InlineCode>} with:
        </Text>
        <DynamicCodeBlock lang="json" code={claudeCodeConfigJson} />
      </div>
    </div>
  );
};
