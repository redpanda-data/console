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

interface RemoteMCPConnectClientGeminiProps {
  mcpServer: MCPServer;
}

export const RemoteMCPConnectClientGemini = ({ mcpServer }: RemoteMCPConnectClientGeminiProps) => {
  const [selectedScope, setSelectedScope] = useState<string>('user');

  const clusterId = config?.clusterId;
  const mcpServerId = mcpServer?.id;
  const mcpServerName = mcpServer?.displayName ?? '';

  const geminiCommand = `gemini mcp add ${mcpServerName} \\
--scope ${selectedScope} \\
--transport stdio rpk \\
--args "-X" "cloud_environment=${getRpkCloudEnvironment()}" "cloud" "mcp" "proxy" "--cluster-id" "${clusterId}" "--mcp-server-id" "${mcpServerId}"`;

  const geminiConfigJson = `{
  "mcpServers": {
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
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="project">Project</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-2">
          <Text variant="small" className="text-muted-foreground">
            {selectedScope === 'user' && 'Configuration available across all your projects'}
            {selectedScope === 'project' && 'Configuration shared with team via project settings'}
          </Text>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <DynamicCodeBlock lang="bash" code={geminiCommand} />
        <Text>
          Alternatively, update <InlineCode>~/.gemini/settings.json</InlineCode> with:
        </Text>
        <DynamicCodeBlock lang="json" code={geminiConfigJson} />
      </div>
    </div>
  );
};
