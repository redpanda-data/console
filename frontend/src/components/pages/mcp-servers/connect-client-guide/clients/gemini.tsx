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
import { InlineCode, List, ListItem } from 'components/redpanda-ui/components/typography';
import { config } from 'config';
import { useState } from 'react';

import GeminiLogo from '../../../../../assets/gemini.svg';
import { RemoteMCPConnectDocsAlert } from '../../remote-mcp-connect-docs-alert';
import { InstallRpkListItem } from '../install-rpk-list-item';
import { LoginToRpkListItem } from '../login-to-rpk-list-item';
import { ClientType, getClientCommand, getClientConfig, getMCPServerName, type MCPServer } from '../utils';

type ClientGeminiProps = {
  mcpServer: MCPServer;
};

// Drives the scope Select's items, options, and help text.
const SCOPE_OPTIONS = [
  {
    value: 'user',
    label: 'User',
    description: 'Configuration available across all your projects',
  },
  {
    value: 'project',
    label: 'Project',
    description: 'Configuration shared with team through project settings',
  },
] as const;

export const ClientGemini = ({ mcpServer }: ClientGeminiProps) => {
  const [selectedScope, setSelectedScope] = useState<string>('user');

  const clusterId = config?.clusterId;
  const mcpServerId = mcpServer?.id;
  const mcpServerName = getMCPServerName(mcpServer?.displayName ?? '');

  const geminiCommand = getClientCommand(ClientType.GEMINI, {
    mcpServerName,
    clusterId,
    mcpServerId,
    isServerless: config.isServerless,
    selectedScope,
  });

  const geminiConfigJson = getClientConfig(ClientType.GEMINI, {
    mcpServerName,
    clusterId,
    mcpServerId,
    isServerless: config.isServerless,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <List className="my-0" ordered>
          <InstallRpkListItem />
          <LoginToRpkListItem />
          <ListItem>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1">
                <span>In</span>
                <span className="inline-flex items-center gap-1 whitespace-nowrap font-bold text-body">
                  <img alt="Gemini" className="h-4 w-4" src={GeminiLogo} />
                  Gemini
                </span>
                <span>, select the configuration scope for the MCP server:</span>
              </div>
              <Label className="font-medium text-sm">Scope</Label>
              <div>
                <Select items={SCOPE_OPTIONS} onValueChange={setSelectedScope} value={selectedScope}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select scope" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Configuration Scope</SelectLabel>
                      {SCOPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-body-sm text-muted-foreground">
                {SCOPE_OPTIONS.find((option) => option.value === selectedScope)?.description}
              </div>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Run the following command to add the MCP server:</span>
            </div>
            <DynamicCodeBlock code={geminiCommand} lang="bash" />
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Alternatively, you can manually update</span>
              <InlineCode className="whitespace-nowrap">~/.gemini/settings.json</InlineCode>
              <span>with:</span>
            </div>
            <DynamicCodeBlock code={geminiConfigJson} lang="json" />
          </ListItem>
          <ListItem>
            Restart Gemini and verify the MCP server is available:
            <DynamicCodeBlock code="gemini mcp list" lang="bash" />
            Or alternatively use:
            <DynamicCodeBlock code="/mcp list" lang="bash" />
          </ListItem>
        </List>
      </div>
      <RemoteMCPConnectDocsAlert
        clientName="Gemini"
        documentationUrl="https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md#how-to-interact-with-your-mcp-server"
      />
    </div>
  );
};
