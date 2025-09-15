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

export interface MCPServer {
  id: string;
  displayName: string;
  url: string;
}

export const getRpkCloudEnvironment = () => {
  if (window.location.hostname.includes('main')) {
    return 'integration';
  }
  if (window.location.hostname.includes('preprod')) {
    return 'preprod';
  }
  if (window.location.hostname.includes('cloud.redpanda.com')) {
    return 'production';
  }

  return 'integration';
};

export const getRpkCommand = ({
  clusterId,
  mcpServerId,
  clientType,
  isServerless = false,
}: {
  clusterId?: string;
  mcpServerId?: string;
  clientType?: string;
  isServerless?: boolean;
}) => {
  const clusterFlag = isServerless ? '--serverless-cluster-id' : '--cluster-id';
  const clusterValue = clusterId || (isServerless ? 'YOUR_SERVERLESS_CLUSTER_ID' : 'YOUR_CLUSTER_ID');

  return `rpk -X cloud_environment=${getRpkCloudEnvironment()} cloud mcp proxy \\
${clusterFlag} ${clusterValue} \\
--mcp-server-id ${mcpServerId || 'YOUR_MCP_SERVER_ID'} \\
--install --client ${clientType || 'YOUR_CLIENT_TYPE'}`;
};

export const createMCPConfig = ({
  mcpServerName,
  clusterId,
  mcpServerId,
  isServerless = false,
}: {
  mcpServerName: string;
  clusterId?: string;
  mcpServerId?: string;
  isServerless?: boolean;
}) => ({
  name: mcpServerName,
  command: 'rpk',
  args: [
    '-X',
    `cloud_environment=${getRpkCloudEnvironment()}`,
    'cloud',
    'mcp',
    'proxy',
    isServerless ? '--serverless-cluster-id' : '--cluster-id',
    clusterId,
    '--mcp-server-id',
    mcpServerId,
  ],
});
