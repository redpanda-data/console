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
import { AVAILABLE_CLIENTS, ClientType, type MCPServer } from './utils';
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

const CLIENT_INFO: Record<ClientType, { name: string; logo: string; alt: string }> = {
  [ClientType.CLAUDE_CODE]: { name: 'Claude Code', logo: ClaudeCodeLogo, alt: 'Claude Code CLI' },
  [ClientType.CLAUDE_DESKTOP]: { name: 'Claude Desktop', logo: ClaudeDesktopLogo, alt: 'Claude Desktop app' },
  [ClientType.VSCODE]: { name: 'VSCode', logo: VSCodeLogo, alt: 'VSCode IDE' },
  [ClientType.CURSOR]: { name: 'Cursor', logo: CursorLogo, alt: 'Cursor IDE' },
  [ClientType.WINDSURF]: { name: 'Windsurf', logo: WindsurfLogo, alt: 'Windsurf IDE' },
  [ClientType.GEMINI]: { name: 'Gemini', logo: GeminiLogo, alt: 'Gemini CLI' },
  [ClientType.CODEX]: { name: 'Codex', logo: CodexLogo, alt: 'Codex CLI' },
  [ClientType.WARP]: { name: 'Warp', logo: WarpLogo, alt: 'Warp CLI' },
  [ClientType.AUGGIE]: { name: 'Auggie', logo: AuggieLogo, alt: 'Auggie (Augment Code) CLI' },
  [ClientType.CLINE]: { name: 'Cline', logo: ClineLogo, alt: 'Cline CLI' },
  [ClientType.MANUS]: { name: 'Manus', logo: ManusLogo, alt: 'Manus CLI' },
};

interface RemoteMCPConnectClientGuideProps {
  mcpServer: MCPServer;
}

interface RemoteMCPClientGuideContentProps {
  client: ClientType;
  mcpServer: MCPServer;
}

const RemoteMCPClientGuideContent = ({ client, mcpServer }: RemoteMCPClientGuideContentProps) => {
  switch (client) {
    case ClientType.CLAUDE_CODE:
      return <ClientClaudeCode mcpServer={mcpServer} />;
    case ClientType.CLAUDE_DESKTOP:
      return <ClientClaudeDesktop mcpServer={mcpServer} />;
    case ClientType.VSCODE:
      return <ClientVscode mcpServer={mcpServer} />;
    case ClientType.CURSOR:
      return <ClientCursor mcpServer={mcpServer} />;
    case ClientType.WINDSURF:
      return <ClientWindsurf mcpServer={mcpServer} />;
    case ClientType.GEMINI:
      return <ClientGemini mcpServer={mcpServer} />;
    case ClientType.CODEX:
      return <ClientCodex mcpServer={mcpServer} />;
    case ClientType.WARP:
      return <ClientWarp mcpServer={mcpServer} />;
    case ClientType.AUGGIE:
      return <ClientAuggie mcpServer={mcpServer} />;
    case ClientType.CLINE:
      return <ClientCline mcpServer={mcpServer} />;
    case ClientType.MANUS:
      return <ClientManus mcpServer={mcpServer} />;
    default:
      return <ClientClaudeCode mcpServer={mcpServer} />;
  }
};

export const RemoteMCPConnectClientGuide = ({ mcpServer }: RemoteMCPConnectClientGuideProps) => {
  const [client, setClient] = useState<ClientType>(ClientType.CLAUDE_CODE);

  return (
    <div className="space-y-2">
      <Label className="font-medium text-sm">Connect to your client</Label>
      <div>
        <Select onValueChange={(value) => setClient(value as ClientType)} value={client}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select a client" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Clients</SelectLabel>
              {AVAILABLE_CLIENTS.map((clientId) => {
                const clientInfo = CLIENT_INFO[clientId];
                return (
                  <SelectItem key={clientId} value={clientId}>
                    <div className="flex items-center gap-2">
                      <img alt={clientInfo.alt} className="h-4 w-4" src={clientInfo.logo} />
                      <Text>{clientInfo.name}</Text>
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
