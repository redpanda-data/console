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
import { InlineCode, List, ListItem, Text } from 'components/redpanda-ui/components/typography';
import { config } from 'config';
import { useState } from 'react';
import GeminiLogo from '../../../../assets/gemini.svg';
import { RemoteMCPConnectDocsAlert } from '../remote-mcp-connect-docs-alert';
import { InstallRpkListItem } from './install-rpk-list-item';
import { LoginToRpkListItem } from './login-to-rpk-list-item';
import { getMCPServerName, getRpkCloudEnvironment, type MCPServer } from './utils';

interface RemoteMCPConnectClientGeminiProps {
  mcpServer: MCPServer;
}

export const RemoteMCPConnectClientGemini = ({ mcpServer }: RemoteMCPConnectClientGeminiProps) => {
  const [selectedScope, setSelectedScope] = useState<string>('user');

  const clusterId = config?.clusterId;
  const mcpServerId = mcpServer?.id;
  const mcpServerName = getMCPServerName(mcpServer?.displayName ?? '');
  const clusterFlag = config.isServerless ? '--serverless-cluster-id' : '--cluster-id';

  const showCloudEnvironmentFlag = getRpkCloudEnvironment() !== 'production';
  const cloudEnvArg = showCloudEnvironmentFlag ? `"cloud_environment=${getRpkCloudEnvironment()}" ` : '';

  const geminiCommand = `gemini mcp add ${mcpServerName} \\
--scope ${selectedScope} \\
--transport stdio rpk \\
--args "-X" ${cloudEnvArg}\\
"cloud" "mcp" "proxy" \\
"${clusterFlag}" "${clusterId}" \\
"--mcp-server-id" "${mcpServerId}"`;

  const geminiConfigJson = showCloudEnvironmentFlag
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
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1">
                In <img src={GeminiLogo} alt="Gemini" className="h-4 w-4" />
                <Text as="span" className="font-bold">
                  Gemini
                </Text>
                , select the configuration scope for the MCP server:
              </div>
              <Label className="text-sm font-medium">Scope</Label>
              <div>
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
              <Text variant="small" className="text-muted-foreground">
                {selectedScope === 'user' && 'Configuration available across all your projects'}
                {selectedScope === 'project' && 'Configuration shared with team via project settings'}
              </Text>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex items-center gap-2">Run the following command to add the MCP server:</div>
            <DynamicCodeBlock lang="bash" code={geminiCommand} />
          </ListItem>
          <ListItem>
            <div className="flex items-center gap-2">
              Alternatively, you can manually update <InlineCode>~/.gemini/settings.json</InlineCode> with:
            </div>
            <DynamicCodeBlock lang="json" code={geminiConfigJson} />
          </ListItem>
          <ListItem>
            Restart Gemini and verify the MCP server is available:
            <DynamicCodeBlock lang="bash" code="gemini mcp list" />
            Or alternatively use:
            <DynamicCodeBlock lang="bash" code="/mcp list" />
          </ListItem>
        </List>
      </div>
      <RemoteMCPConnectDocsAlert
        documentationUrl="https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md#how-to-interact-with-your-mcp-server"
        clientName="Gemini"
      />
    </div>
  );
};
