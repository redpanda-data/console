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

export const getMCPServerName = (displayName: string) => {
  // Sanitize the display name to only contain letters, numbers, hyphens and underscores
  const sanitized = displayName
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, '') // Remove special characters except spaces, hyphens, underscores
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple consecutive hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

  // Add redpanda prefix if not already present
  return sanitized.includes('redpanda') ? sanitized : `redpanda-${sanitized}`;
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
  const cloudEnv = getRpkCloudEnvironment();
  const nonProdFlags = cloudEnv !== 'production' ? `-X cloud_environment=${cloudEnv} ` : '';

  return `rpk ${nonProdFlags}cloud mcp proxy \\
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
}) => {
  const baseArgs = [];
  const cloudEnv = getRpkCloudEnvironment();

  if (cloudEnv !== 'production') {
    baseArgs.push('-X', `cloud_environment=${cloudEnv}`);
  }

  baseArgs.push(
    'cloud',
    'mcp',
    'proxy',
    isServerless ? '--serverless-cluster-id' : '--cluster-id',
    clusterId || '',
    '--mcp-server-id',
    mcpServerId || '',
  );

  return {
    name: mcpServerName,
    command: 'rpk',
    args: baseArgs,
  };
};

/**
 * Returns the cloud environment args for shell commands
 * Used in: auggie, codex, gemini command strings
 * @returns Empty string for production, otherwise: '"-X" "cloud_environment=<env>" '
 */
export const getCloudEnvArgsForShell = () => {
  const cloudEnv = getRpkCloudEnvironment();
  return cloudEnv !== 'production' ? `"-X" "cloud_environment=${cloudEnv}" ` : '';
};

/**
 * Returns the cloud environment args for JSON config files with proper indentation
 * Used in: claude-code, claude-desktop, cline, cursor, gemini, manus, vscode, warp, windsurf
 * @param indent - The indentation level (number of spaces)
 * @returns Empty string for production, otherwise: '"-X",\n<indent>"cloud_environment=<env>",\n<indent>'
 */
export const getCloudEnvArgsForJson = (indent = 8) => {
  const cloudEnv = getRpkCloudEnvironment();
  const spaces = ' '.repeat(indent);
  return cloudEnv !== 'production' ? `"-X",\n${spaces}"cloud_environment=${cloudEnv}",\n${spaces}` : '';
};

/**
 * Returns the cloud environment args for TOML config files
 * Used in: codex TOML config
 * @returns Empty string for production, otherwise: '"-X","cloud_environment=<env>", '
 */
export const getCloudEnvArgsForToml = () => {
  const cloudEnv = getRpkCloudEnvironment();
  return cloudEnv !== 'production' ? `"-X","cloud_environment=${cloudEnv}", ` : '';
};

/**
 * Returns the cloud environment args for inline JSON (single line)
 * Used in: claude-code command's inline JSON
 * @returns Empty string for production, otherwise: '"-X","cloud_environment=<env>",'
 */
export const getCloudEnvArgsForInlineJson = () => {
  const cloudEnv = getRpkCloudEnvironment();
  return cloudEnv !== 'production' ? `"-X","cloud_environment=${cloudEnv}",` : '';
};

export const AVAILABLE_CLIENTS = [
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

export type ClientType = (typeof AVAILABLE_CLIENTS)[number];

interface ClientCommandParams {
  mcpServerName: string;
  clusterId?: string;
  mcpServerId?: string;
  isServerless?: boolean;
  selectedScope?: string; // For claude-code and gemini
}

/**
 * Returns the CLI command to add an MCP server for a given client
 * Only applicable for clients that support CLI commands
 */
export const getClientCommand = (clientType: ClientType, params: ClientCommandParams): string => {
  const { mcpServerName, clusterId = '', mcpServerId = '', isServerless = false, selectedScope = 'local' } = params;
  const clusterFlag = isServerless ? '--serverless-cluster-id' : '--cluster-id';

  switch (clientType) {
    case 'auggie':
      return `auggie mcp add ${mcpServerName} \\
--transport stdio \\
--command rpk \\
--args ${getCloudEnvArgsForShell()}\\
"cloud" "mcp" "proxy" \\
"${clusterFlag}" "${clusterId}" \\
"--mcp-server-id" "${mcpServerId}"`;

    case 'claude-code':
      return `claude mcp add-json ${mcpServerName} --scope ${selectedScope} \\
'{"type":"stdio","command":"rpk","args":[
${getCloudEnvArgsForInlineJson()}"cloud","mcp","proxy",
"${clusterFlag}","${clusterId}",
"--mcp-server-id","${mcpServerId}"]}'`;

    case 'codex':
      return `codex mcp add ${mcpServerName} -- rpk \\
${getCloudEnvArgsForShell()}\\
"cloud" "mcp" "proxy" \\
"${clusterFlag}" "${clusterId}" \\
"--mcp-server-id" "${mcpServerId}"`;

    case 'gemini':
      return `gemini mcp add ${mcpServerName} \\
--scope ${selectedScope} \\
--transport stdio rpk \\
--args ${getCloudEnvArgsForShell()}\\
"cloud" "mcp" "proxy" \\
"${clusterFlag}" "${clusterId}" \\
"--mcp-server-id" "${mcpServerId}"`;

    case 'cursor':
      // Cursor uses a button/link approach, command is less common
      return '';

    case 'vscode':
      // VSCode uses a button/link approach, command is less common
      return '';

    default:
      // Other clients don't have CLI commands
      return '';
  }
};

/**
 * Returns the config file content for a given client
 */
export const getClientConfig = (clientType: ClientType, params: ClientCommandParams): string => {
  const { mcpServerName, clusterId = '', mcpServerId = '', isServerless = false } = params;
  const clusterFlag = isServerless ? '--serverless-cluster-id' : '--cluster-id';

  switch (clientType) {
    case 'auggie':
      return `{
  "mcpServers": {
    "${mcpServerName}": {
      "command": "rpk",
      "args": [
        ${getCloudEnvArgsForJson(8)}"cloud",
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

    case 'claude-code':
    case 'claude-desktop':
    case 'vscode':
      return `{
  "mcp": {
    "servers": {
      "${mcpServerName}": {
        "command": "rpk",
        "args": [
          ${getCloudEnvArgsForJson(10)}"cloud",
          "mcp",
          "proxy",
          "${clusterFlag}",
          "${clusterId}",
          "--mcp-server-id",
          "${mcpServerId}"
        ]
      }
    }
  }
}`;

    case 'cline':
    case 'cursor':
    case 'gemini':
    case 'manus':
      return `{
  "mcpServers": {
    "${mcpServerName}": {
      "command": "rpk",
      "args": [
        ${getCloudEnvArgsForJson(8)}"cloud",
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

    case 'codex':
      return `[mcp_servers.${mcpServerName}]
command = "rpk"
args = [${getCloudEnvArgsForToml()}"cloud", "mcp", "proxy", "${clusterFlag}", "${clusterId}", "--mcp-server-id", "${mcpServerId}"]`;

    case 'warp':
    case 'windsurf':
      return `{
  "mcpServers": {
    "${mcpServerName}": {
      "command": "rpk",
      "args": [
        ${getCloudEnvArgsForJson(6)}"cloud",
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
  }
};
