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

import { ClientAuggie } from './clients/auggie';
import { ClientClaudeCode } from './clients/claude-code';
import { ClientClaudeDesktop } from './clients/claude-desktop';
import { ClientCline } from './clients/cline';
import { ClientCodex } from './clients/codex';
import { ClientCursor } from './clients/cursor';
import { ClientGemini } from './clients/gemini';
import { ClientManus } from './clients/manus';
import { ClientVscode } from './clients/vscode';
import { ClientWarp } from './clients/warp';
import { ClientWindsurf } from './clients/windsurf';
import type { MCPServer } from './utils';
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
      return <ClientClaudeCode mcpServer={mcpServer} />;
    case 'claude-desktop':
      return <ClientClaudeDesktop mcpServer={mcpServer} />;
    case 'vscode':
      return <ClientVscode mcpServer={mcpServer} />;
    case 'cursor':
      return <ClientCursor mcpServer={mcpServer} />;
    case 'windsurf':
      return <ClientWindsurf mcpServer={mcpServer} />;
    case 'gemini':
      return <ClientGemini mcpServer={mcpServer} />;
    case 'codex':
      return <ClientCodex mcpServer={mcpServer} />;
    case 'warp':
      return <ClientWarp mcpServer={mcpServer} />;
    case 'auggie':
      return <ClientAuggie mcpServer={mcpServer} />;
    case 'cline':
      return <ClientCline mcpServer={mcpServer} />;
    case 'manus':
      return <ClientManus mcpServer={mcpServer} />;
    default:
      return <ClientClaudeCode mcpServer={mcpServer} />;
  }
};

export const RemoteMCPConnectClientGuide = ({ mcpServer }: RemoteMCPConnectClientGuideProps) => {
  const [client, setClient] = useState<Client>('claude-code');

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Connect to your client</Label>
      <div>
        <Select onValueChange={(value) => setClient(value as Client)} value={client}>
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
                      <img alt={client.alt} className="w-4 h-4" src={client.logo} />
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
