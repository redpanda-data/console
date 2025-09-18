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
import WindsurfLogo from '../../../../assets/windsurf.svg';
import { RemoteMCPConnectDocsAlert } from '../remote-mcp-connect-docs-alert';
import { InstallRpkListItem } from './install-rpk-list-item';
import { LoginToRpkListItem } from './login-to-rpk-list-item';
import { getMCPServerName, getRpkCloudEnvironment, type MCPServer } from './utils';

interface RemoteMCPConnectClientWindsurfProps {
  mcpServer: MCPServer;
}

export const RemoteMCPConnectClientWindsurf = ({ mcpServer }: RemoteMCPConnectClientWindsurfProps) => {
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
        <List ordered className="my-0">
          <InstallRpkListItem />
          <LoginToRpkListItem />
          <ListItem>
            <div className="flex items-center gap-2">
              In{' '}
              <Text as="span" className="font-bold inline-flex items-center gap-1">
                <img src={WindsurfLogo} alt="Windsurf" className="h-4 w-4" /> Windsurf
              </Text>
              <Kbd>
                <Command className="h-4 w-4" />
              </Kbd>
              /<Kbd>Ctrl</Kbd> + <Kbd>Shift</Kbd> + <Kbd>P</Kbd> to open the{' '}
              <Text as="span" className="font-bold">
                Command Palette → Windsurf: MCP Configuration Panel → Add a Custom MCP Server
              </Text>
            </div>
          </ListItem>
          <ListItem>
            <Text>
              Update <InlineCode>~/.codeium/windsurf/mcp_config.json</InlineCode> with:
            </Text>
            <DynamicCodeBlock lang="json" code={windsurfConfigJson} />
          </ListItem>
          <ListItem>Restart Windsurf and the MCP server should be available for use.</ListItem>
        </List>
      </div>
      <RemoteMCPConnectDocsAlert
        documentationUrl="https://docs.windsurf.com/windsurf/cascade/mcp"
        clientName="Windsurf"
      />
    </div>
  );
};
