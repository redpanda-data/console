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
import { Kbd } from 'components/redpanda-ui/components/kbd';
import { InlineCode, List, ListItem, Text } from 'components/redpanda-ui/components/typography';
import { config } from 'config';
import { Command } from 'lucide-react';

import WindsurfLogo from '../../../../../assets/windsurf.svg';
import { RemoteMCPConnectDocsAlert } from '../../remote-mcp-connect-docs-alert';
import { InstallRpkListItem } from '../install-rpk-list-item';
import { LoginToRpkListItem } from '../login-to-rpk-list-item';
import { getMCPServerName, getRpkCloudEnvironment, type MCPServer } from '../utils';

type ClientWindsurfProps = {
  mcpServer: MCPServer;
};

export const ClientWindsurf = ({ mcpServer }: ClientWindsurfProps) => {
  const clusterId = config?.clusterId;
  const mcpServerName = getMCPServerName(mcpServer?.displayName ?? '');
  const clusterFlag = config.isServerless ? '--serverless-cluster-id' : '--cluster-id';

  const showCloudEnvironmentFlag = getRpkCloudEnvironment() !== 'production';
  const baseArgs = ['-X'];
  if (showCloudEnvironmentFlag) {
    baseArgs.push(`cloud_environment=${getRpkCloudEnvironment()}`);
  }
  baseArgs.push('cloud', 'mcp', 'proxy', clusterFlag, `${clusterId}`, '--mcp-server-id', mcpServer?.id);

  const windsurfConfig = {
    mcpServers: {
      [mcpServerName]: {
        command: 'rpk',
        args: baseArgs,
      },
    },
  };

  const windsurfConfigJson = JSON.stringify(windsurfConfig, null, 2);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <List className="my-0" ordered>
          <InstallRpkListItem />
          <LoginToRpkListItem />
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>In</span>
              <Text as="span" className="inline-flex items-center gap-1 whitespace-nowrap font-bold">
                <img alt="Windsurf" className="h-4 w-4" src={WindsurfLogo} /> Windsurf
              </Text>
              <div className="inline-flex items-center gap-1 whitespace-nowrap">
                <Kbd>
                  <Command className="h-4 w-4" />
                </Kbd>
                /<Kbd>Ctrl</Kbd> + <Kbd>Shift</Kbd> + <Kbd>P</Kbd>
              </div>
              <span>to open the</span>
              <Text as="span" className="font-bold">
                Command Palette → Windsurf: MCP Configuration Panel → Add a Custom MCP Server
              </Text>
            </div>
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Update</span>
              <InlineCode className="whitespace-nowrap">~/.codeium/windsurf/mcp_config.json</InlineCode>
              <span>with:</span>
            </div>
            <DynamicCodeBlock code={windsurfConfigJson} lang="json" />
          </ListItem>
          <ListItem>Restart Windsurf and the MCP server should be available for use.</ListItem>
        </List>
      </div>
      <RemoteMCPConnectDocsAlert
        clientName="Windsurf"
        documentationUrl="https://docs.windsurf.com/windsurf/cascade/mcp"
      />
    </div>
  );
};
