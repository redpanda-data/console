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
import { InlineCode, List, ListItem, Text } from 'components/redpanda-ui/components/typography';
import { config } from 'config';

import AuggieLogo from '../../../../../assets/auggie.svg';
import { RemoteMCPConnectDocsAlert } from '../../remote-mcp-connect-docs-alert';
import { InstallRpkListItem } from '../install-rpk-list-item';
import { LoginToRpkListItem } from '../login-to-rpk-list-item';
import { ClientType, getClientCommand, getClientConfig, getMCPServerName, type MCPServer } from '../utils';

type ClientAuggieProps = {
  mcpServer: MCPServer;
};

export const ClientAuggie = ({ mcpServer }: ClientAuggieProps) => {
  const clusterId = config?.clusterId;
  const mcpServerId = mcpServer?.id;
  const mcpServerName = getMCPServerName(mcpServer?.displayName ?? '');

  const auggieCommand = getClientCommand(ClientType.AUGGIE, {
    mcpServerName,
    clusterId,
    mcpServerId,
    isServerless: config.isServerless,
  });

  const augmentCodeConfigJson = getClientConfig(ClientType.AUGGIE, {
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
              <Text as="span" className="inline-flex items-center gap-1 whitespace-nowrap font-bold">
                <img alt="Auggie (Augment Code) CLI" className="h-4 w-4" src={AuggieLogo} /> Auggie (Augment Code CLI)
              </Text>
              <span>and run the following command:</span>
            </div>
            <DynamicCodeBlock code={auggieCommand} lang="bash" />
          </ListItem>
          <ListItem>
            <div className="flex flex-wrap items-center gap-1">
              <span>Alternatively, you can manually update</span>
              <InlineCode className="whitespace-nowrap">~/.augment/mcp.json</InlineCode>
              <span>with the following MCP server configuration:</span>
            </div>
            <DynamicCodeBlock code={augmentCodeConfigJson} lang="json" />
          </ListItem>
          <ListItem>
            Verify the MCP server is available with:
            <DynamicCodeBlock code="auggie mcp list" lang="bash" />
            Or alternatively use:
            <DynamicCodeBlock code="/mcp-status" lang="bash" />
          </ListItem>
        </List>
      </div>
      <RemoteMCPConnectDocsAlert
        clientName="Auggie"
        documentationUrl="https://docs.augmentcode.com/setup-augment/mcp#import-from-json"
      />
    </div>
  );
};
