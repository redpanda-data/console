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
import { Text } from 'components/redpanda-ui/components/typography';
import { useState } from 'react';
import AuggieLogo from '../../../../assets/auggie.svg';
import ClaudeCodeLogo from '../../../../assets/claude-code.svg';
import ClaudeDesktopLogo from '../../../../assets/claude-desktop.svg';
import ClineLogo from '../../../../assets/cline.svg';
import CodexLogo from '../../../../assets/codex.svg';
import CursorLogo from '../../../../assets/cursor.svg';
import GeminiLogo from '../../../../assets/gemini.svg';
import ManusLogo from '../../../../assets/manus.svg';
import VSCodeLogo from '../../../../assets/vscode.svg';
import WarpLogo from '../../../../assets/warp.svg';
import WindsurfLogo from '../../../../assets/windsurf.svg';
import { RemoteMCPConnectClientAuggie } from './remote-mcp-connect-client-auggie';
import { RemoteMCPConnectClientClaudeCode } from './remote-mcp-connect-client-claude-code';
import { RemoteMCPConnectClientClaudeDesktop } from './remote-mcp-connect-client-claude-desktop';
import { RemoteMCPConnectClientCline } from './remote-mcp-connect-client-cline';
import { RemoteMCPConnectClientCodex } from './remote-mcp-connect-client-codex';
import { RemoteMCPConnectClientCursor } from './remote-mcp-connect-client-cursor';
import { RemoteMCPConnectClientGemini } from './remote-mcp-connect-client-gemini';
import { RemoteMCPConnectClientManus } from './remote-mcp-connect-client-manus';
import { RemoteMCPConnectClientVSCode } from './remote-mcp-connect-client-vscode';
import { RemoteMCPConnectClientWarp } from './remote-mcp-connect-client-warp';
import { RemoteMCPConnectClientWindsurf } from './remote-mcp-connect-client-windsurf';
import type { MCPServer } from './utils';

const AVAILABLE_CLIENTS = [
  'claude-code',
  'claude-desktop',
  'vscode',
  'cursor',
  'windsurf',
  'gemini',
  'codex',
  'warp',
  'auggie',
  'cline',
  'manus',
] as const;

type Client = (typeof AVAILABLE_CLIENTS)[number];

const CLIENT_INFO: Record<Client, { name: string; logo: string; alt: string }> = {
  'claude-code': { name: 'Claude Code', logo: ClaudeCodeLogo, alt: 'Claude Code CLI' },
  'claude-desktop': { name: 'Claude Desktop', logo: ClaudeDesktopLogo, alt: 'Claude Desktop app' },
  vscode: { name: 'VSCode', logo: VSCodeLogo, alt: 'VSCode IDE' },
  cursor: { name: 'Cursor', logo: CursorLogo, alt: 'Cursor IDE' },
  windsurf: { name: 'Windsurf', logo: WindsurfLogo, alt: 'Windsurf IDE' },
  gemini: { name: 'Gemini', logo: GeminiLogo, alt: 'Gemini CLI' },
  codex: { name: 'Codex', logo: CodexLogo, alt: 'Codex CLI' },
  warp: { name: 'Warp', logo: WarpLogo, alt: 'Warp CLI' },
  auggie: { name: 'Auggie', logo: AuggieLogo, alt: 'Auggie (Augment Code) CLI' },
  cline: { name: 'Cline', logo: ClineLogo, alt: 'Cline CLI' },
  manus: { name: 'Manus', logo: ManusLogo, alt: 'Manus CLI' },
};

interface RemoteMCPConnectClientGuideProps {
  mcpServer: MCPServer;
}

interface RemoteMCPClientGuideContentProps {
  client: Client;
  mcpServer: MCPServer;
}

const RemoteMCPClientGuideContent = ({ client, mcpServer }: RemoteMCPClientGuideContentProps) => {
  switch (client) {
    case 'claude-code':
      return <RemoteMCPConnectClientClaudeCode mcpServer={mcpServer} />;
    case 'claude-desktop':
      return <RemoteMCPConnectClientClaudeDesktop mcpServer={mcpServer} />;
    case 'vscode':
      return <RemoteMCPConnectClientVSCode mcpServer={mcpServer} />;
    case 'cursor':
      return <RemoteMCPConnectClientCursor mcpServer={mcpServer} />;
    case 'windsurf':
      return <RemoteMCPConnectClientWindsurf mcpServer={mcpServer} />;
    case 'gemini':
      return <RemoteMCPConnectClientGemini mcpServer={mcpServer} />;
    case 'codex':
      return <RemoteMCPConnectClientCodex mcpServer={mcpServer} />;
    case 'warp':
      return <RemoteMCPConnectClientWarp mcpServer={mcpServer} />;
    case 'auggie':
      return <RemoteMCPConnectClientAuggie mcpServer={mcpServer} />;
    case 'cline':
      return <RemoteMCPConnectClientCline mcpServer={mcpServer} />;
    case 'manus':
      return <RemoteMCPConnectClientManus mcpServer={mcpServer} />;
    default:
      return <RemoteMCPConnectClientClaudeCode mcpServer={mcpServer} />;
  }
};

export const RemoteMCPConnectClientGuide = ({ mcpServer }: RemoteMCPConnectClientGuideProps) => {
  const [client, setClient] = useState<Client>('claude-code');

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Connect to your client</Label>
      <div>
        <Select value={client} onValueChange={(value) => setClient(value as Client)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select a client" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Clients</SelectLabel>
              {AVAILABLE_CLIENTS.map((clientId) => {
                const client = CLIENT_INFO[clientId];
                return (
                  <SelectItem key={clientId} value={clientId}>
                    <div className="flex items-center gap-2">
                      <img src={client.logo} alt={client.alt} className="w-4 h-4" />
                      <Text>{client.name}</Text>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectGroup>
          </SelectContent>
        </Select>

        <RemoteMCPClientGuideContent client={client} mcpServer={mcpServer} />
      </div>
    </div>
  );
};
