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
import { InlineCode, List, ListItem } from 'components/redpanda-ui/components/typography';
import { config } from 'config';
import { Server, Settings } from 'lucide-react';

import ClineLogo from '../../../../../assets/cline.svg';
import { RemoteMCPConnectDocsAlert } from '../../remote-mcp-connect-docs-alert';
import { InstallRpkListItem } from '../install-rpk-list-item';
import { LoginToRpkListItem } from '../login-to-rpk-list-item';
import { ClientType, getClientConfig, getMCPServerName, type MCPServer } from '../utils';

type ClientClineProps = {
  mcpServer: MCPServer;
};

export const ClientCline = ({ mcpServer }: ClientClineProps) => {
  const clusterId = config?.clusterId;
  const mcpServerId = mcpServer?.id;
  const mcpServerName = getMCPServerName(mcpServer?.displayName ?? '');

  const clineConfigJson = getClientConfig(ClientType.CLINE, {
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
            <div className="flex flex-wrap items-center gap-1">
              <span>Open</span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap font-bold text-body">
                <img alt="Cline" className="h-4 w-4" src={ClineLogo} />
                Cline extension
              </span>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <div className="text-body">Click on</div>
              <span className="inline-flex items-center gap-1 whitespace-nowrap font-bold text-body">
                <Server className="h-4 w-4" />
                MCP Servers
              </span>
              <div className="text-body">section at the bottom of the prompt window</div>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Click</span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap font-bold text-body">
                <Settings className="h-4 w-4" />
                Configure MCP Servers
              </span>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Add the following configuration to your</span>
              <InlineCode className="whitespace-nowrap">cline_mcp_settings.json</InlineCode>
            </div>
            <DynamicCodeBlock code={clineConfigJson} lang="json" />
          </ListItem>
          <ListItem>
            Press <span className="font-bold text-body">Done</span>
          </ListItem>
          <ListItem>
            <div className="flex items-center gap-2">
              Cline will automatically reload and you can start using the MCP server
            </div>
          </ListItem>
        </List>
      </div>
      <RemoteMCPConnectDocsAlert clientName="Cline" documentationUrl="https://docs.cline.bot/mcp/mcp-overview" />
    </div>
  );
};
