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

import {
  AVAILABLE_CLIENTS,
  createMCPConfig,
  getClientCommand,
  getClientConfig,
  getMCPServerName,
  getRpkCloudEnvironment,
  getRpkCommand,
} from './utils';

const mockLocation = (hostname: string) => {
  Object.defineProperty(window, 'location', {
    value: { hostname },
    writable: true,
    configurable: true,
  });
};

describe('getRpkCloudEnvironment', () => {
  test('returns "integration" when hostname includes "main"', () => {
    mockLocation('main--redpanda-cloud.netlify.app');
    expect(getRpkCloudEnvironment()).toBe('integration');
  });

  test('returns "preprod" when hostname includes "preprod"', () => {
    mockLocation('preprod--redpanda-cloud.netlify.app');
    expect(getRpkCloudEnvironment()).toBe('preprod');
  });

  test('returns "production" when hostname includes "cloud.redpanda.com"', () => {
    mockLocation('cloud.redpanda.com');
    expect(getRpkCloudEnvironment()).toBe('production');
  });

  test('returns "integration" for other hostnames (default case)', () => {
    mockLocation('localhost:3004');
    expect(getRpkCloudEnvironment()).toBe('integration');
  });

  test('returns "integration" for development environments', () => {
    mockLocation('127.0.0.1');
    expect(getRpkCloudEnvironment()).toBe('integration');
  });
});

describe('getMCPServerName', () => {
  test('converts display name to lowercase', () => {
    expect(getMCPServerName('MyServer')).toBe('redpanda-myserver');
    expect(getMCPServerName('TEST SERVER')).toBe('redpanda-test-server');
  });

  test('replaces spaces with hyphens', () => {
    expect(getMCPServerName('my test server')).toBe('redpanda-my-test-server');
    expect(getMCPServerName('multiple   spaces')).toBe('redpanda-multiple-spaces');
  });

  test('removes special characters', () => {
    expect(getMCPServerName('my@server#123')).toBe('redpanda-myserver123');
    expect(getMCPServerName('test!@#$%^&*()server')).toBe('redpanda-testserver');
    expect(getMCPServerName('my.server.name')).toBe('redpanda-myservername');
  });

  test('preserves hyphens and underscores', () => {
    expect(getMCPServerName('my-server_name')).toBe('redpanda-my-server_name');
    expect(getMCPServerName('test_server-123')).toBe('redpanda-test_server-123');
  });

  test('replaces multiple consecutive hyphens with single hyphen', () => {
    expect(getMCPServerName('my---server')).toBe('redpanda-my-server');
    expect(getMCPServerName('test----name')).toBe('redpanda-test-name');
  });

  test('removes leading and trailing hyphens', () => {
    expect(getMCPServerName('-myserver-')).toBe('redpanda-myserver');
    expect(getMCPServerName('---test---')).toBe('redpanda-test');
  });

  test('does not add prefix if name already contains "redpanda"', () => {
    expect(getMCPServerName('redpanda-server')).toBe('redpanda-server');
    expect(getMCPServerName('my-redpanda-server')).toBe('my-redpanda-server');
    expect(getMCPServerName('redpanda')).toBe('redpanda');
  });

  test('adds prefix if name does not contain "redpanda"', () => {
    expect(getMCPServerName('my-server')).toBe('redpanda-my-server');
    expect(getMCPServerName('test')).toBe('redpanda-test');
  });

  test('handles empty string', () => {
    expect(getMCPServerName('')).toBe('redpanda-');
  });

  test('handles complex scenarios', () => {
    expect(getMCPServerName('My Server @ Test (2024)!')).toBe('redpanda-my-server-test-2024');
    expect(getMCPServerName('  Leading and Trailing Spaces  ')).toBe('redpanda-leading-and-trailing-spaces');
    expect(getMCPServerName('MCP!!!Server---123')).toBe('redpanda-mcpserver-123');
  });

  test('handles names with only special characters', () => {
    expect(getMCPServerName('!@#$%^&*()')).toBe('redpanda-');
    expect(getMCPServerName('---')).toBe('redpanda-');
  });

  test('case sensitivity with redpanda prefix', () => {
    expect(getMCPServerName('Redpanda Server')).toBe('redpanda-server');
    expect(getMCPServerName('REDPANDA SERVER')).toBe('redpanda-server');
    expect(getMCPServerName('RedPanda')).toBe('redpanda');
  });
});

describe('getRpkCommand', () => {
  const baseParams = {
    clusterId: 'cluster-123',
    mcpServerId: 'mcp-456',
    isServerless: false,
  };

  describe('Production environment (no -X cloud_environment flag)', () => {
    beforeAll(() => {
      mockLocation('cloud.redpanda.com');
    });

    describe.each(AVAILABLE_CLIENTS.map((client) => ({ clientType: client })))('clientType: $clientType', ({
      clientType,
    }) => {
      test('generates correct command', () => {
        const command = getRpkCommand({ ...baseParams, clientType });
        expect(command).toMatchSnapshot();
      });
    });

    test('generates command without client type (uses placeholder)', () => {
      const command = getRpkCommand(baseParams);
      expect(command).toMatchSnapshot();
    });
  });

  describe('Non-production environment (with -X cloud_environment flag)', () => {
    beforeAll(() => {
      mockLocation('main--redpanda-cloud.netlify.app');
    });

    describe.each(AVAILABLE_CLIENTS.map((client) => ({ clientType: client })))('clientType: $clientType', ({
      clientType,
    }) => {
      test('generates correct command with environment flag', () => {
        const command = getRpkCommand({ ...baseParams, clientType });
        expect(command).toMatchSnapshot();
      });
    });
  });

  describe('Serverless cluster flag', () => {
    beforeAll(() => {
      mockLocation('cloud.redpanda.com');
    });

    test('uses --serverless-cluster-id for serverless clusters', () => {
      const command = getRpkCommand({
        ...baseParams,
        clientType: 'claude-code',
        isServerless: true,
      });
      expect(command).toContain('--serverless-cluster-id');
      expect(command).toMatchSnapshot();
    });

    test('uses --cluster-id for regular clusters', () => {
      const command = getRpkCommand({
        ...baseParams,
        clientType: 'claude-code',
        isServerless: false,
      });
      expect(command).toContain('--cluster-id');
      expect(command).not.toContain('--serverless-cluster-id');
      expect(command).toMatchSnapshot();
    });
  });

  describe('Default placeholders', () => {
    beforeAll(() => {
      mockLocation('cloud.redpanda.com');
    });

    test('uses placeholder when clusterId is not provided', () => {
      const command = getRpkCommand({
        mcpServerId: 'mcp-456',
        clientType: 'claude-code',
        isServerless: false,
      });
      expect(command).toContain('YOUR_CLUSTER_ID');
      expect(command).toMatchSnapshot();
    });

    test('uses placeholder when mcpServerId is not provided', () => {
      const command = getRpkCommand({
        clusterId: 'cluster-123',
        clientType: 'claude-code',
        isServerless: false,
      });
      expect(command).toContain('YOUR_MCP_SERVER_ID');
      expect(command).toMatchSnapshot();
    });

    test('uses serverless placeholder when clusterId is not provided for serverless', () => {
      const command = getRpkCommand({
        mcpServerId: 'mcp-456',
        clientType: 'claude-code',
        isServerless: true,
      });
      expect(command).toContain('YOUR_SERVERLESS_CLUSTER_ID');
      expect(command).toMatchSnapshot();
    });
  });

  describe('Preprod environment', () => {
    beforeAll(() => {
      mockLocation('preprod--redpanda-cloud.netlify.app');
    });

    test('includes preprod environment flag', () => {
      const command = getRpkCommand({
        ...baseParams,
        clientType: 'claude-code',
      });
      expect(command).toContain('-X cloud_environment=preprod');
      expect(command).toMatchSnapshot();
    });
  });
});

describe('createMCPConfig', () => {
  const baseParams = {
    mcpServerName: 'test-server',
    clusterId: 'cluster-123',
    mcpServerId: 'mcp-456',
    isServerless: false,
  };

  describe('Production environment (no -X cloud_environment flag)', () => {
    beforeAll(() => {
      mockLocation('cloud.redpanda.com');
    });

    test('creates config with all parameters', () => {
      const config = createMCPConfig(baseParams);
      expect(config.name).toBe('test-server');
      expect(config.command).toBe('rpk');
      expect(config.args).toEqual([
        'cloud',
        'mcp',
        'proxy',
        '--cluster-id',
        'cluster-123',
        '--mcp-server-id',
        'mcp-456',
      ]);
    });

    test('creates config for serverless cluster', () => {
      const config = createMCPConfig({
        ...baseParams,
        isServerless: true,
      });
      expect(config.args).toContain('--serverless-cluster-id');
      expect(config.args).not.toContain('--cluster-id');
      expect(config).toMatchSnapshot();
    });

    test('creates config with empty strings for missing IDs', () => {
      const config = createMCPConfig({
        mcpServerName: 'test-server',
      });
      expect(config.args).toContain('');
      expect(config).toMatchSnapshot();
    });
  });

  describe('Non-production environment (with -X cloud_environment flag)', () => {
    beforeAll(() => {
      mockLocation('main--redpanda-cloud.netlify.app');
    });

    test('includes environment flag in args', () => {
      const config = createMCPConfig(baseParams);
      expect(config.args[0]).toBe('-X');
      expect(config.args[1]).toBe('cloud_environment=integration');
      expect(config.args).toEqual([
        '-X',
        'cloud_environment=integration',
        'cloud',
        'mcp',
        'proxy',
        '--cluster-id',
        'cluster-123',
        '--mcp-server-id',
        'mcp-456',
      ]);
    });

    test('includes environment flag for serverless cluster', () => {
      const config = createMCPConfig({
        ...baseParams,
        isServerless: true,
      });
      expect(config.args).toContain('-X');
      expect(config.args).toContain('cloud_environment=integration');
      expect(config.args).toContain('--serverless-cluster-id');
      expect(config).toMatchSnapshot();
    });
  });

  describe('Preprod environment', () => {
    beforeAll(() => {
      mockLocation('preprod--redpanda-cloud.netlify.app');
    });

    test('includes preprod environment flag in args', () => {
      const config = createMCPConfig(baseParams);
      expect(config.args[0]).toBe('-X');
      expect(config.args[1]).toBe('cloud_environment=preprod');
      expect(config).toMatchSnapshot();
    });
  });

  describe('Empty clusterId and mcpServerId', () => {
    beforeAll(() => {
      mockLocation('cloud.redpanda.com');
    });

    test('uses empty strings when IDs are not provided', () => {
      const config = createMCPConfig({
        mcpServerName: 'my-server',
        clusterId: undefined,
        mcpServerId: undefined,
      });
      expect(config.name).toBe('my-server');
      expect(config.args[3]).toBe('--cluster-id');
      expect(config.args[4]).toBe('');
      expect(config.args[5]).toBe('--mcp-server-id');
      expect(config.args[6]).toBe('');
    });
  });

  describe('Integration with VSCode', () => {
    beforeAll(() => {
      mockLocation('cloud.redpanda.com');
    });

    test('creates config object compatible with VSCode extension', () => {
      const config = createMCPConfig({
        mcpServerName: 'vscode-test-server',
        clusterId: 'vscode-cluster-123',
        mcpServerId: 'vscode-mcp-456',
        isServerless: false,
      });

      // VSCode extension expects this exact structure
      expect(config).toHaveProperty('name');
      expect(config).toHaveProperty('command');
      expect(config).toHaveProperty('args');
      expect(config.name).toBe('vscode-test-server');
      expect(config.command).toBe('rpk');
      expect(Array.isArray(config.args)).toBe(true);
      expect(config).toMatchSnapshot();
    });

    test('creates config for VSCode with serverless cluster', () => {
      const config = createMCPConfig({
        mcpServerName: 'vscode-serverless',
        clusterId: 'serverless-123',
        mcpServerId: 'mcp-789',
        isServerless: true,
      });

      expect(config.args).toContain('--serverless-cluster-id');
      expect(config).toMatchSnapshot();
    });
  });

  describe('Integration with Cursor', () => {
    beforeAll(() => {
      mockLocation('cloud.redpanda.com');
    });

    test('creates config object compatible with Cursor IDE', () => {
      const config = createMCPConfig({
        mcpServerName: 'cursor-test-server',
        clusterId: 'cursor-cluster-123',
        mcpServerId: 'cursor-mcp-456',
        isServerless: false,
      });

      // Cursor IDE expects this exact structure
      expect(config).toHaveProperty('name');
      expect(config).toHaveProperty('command');
      expect(config).toHaveProperty('args');
      expect(config.name).toBe('cursor-test-server');
      expect(config.command).toBe('rpk');
      expect(Array.isArray(config.args)).toBe(true);
      expect(config).toMatchSnapshot();
    });

    test('creates config for Cursor with serverless cluster', () => {
      const config = createMCPConfig({
        mcpServerName: 'cursor-serverless',
        clusterId: 'serverless-456',
        mcpServerId: 'mcp-999',
        isServerless: true,
      });

      expect(config.args).toContain('--serverless-cluster-id');
      expect(config).toMatchSnapshot();
    });
  });

  describe('Non-production environment for VSCode and Cursor', () => {
    beforeAll(() => {
      mockLocation('main--redpanda-cloud.netlify.app');
    });

    test('VSCode config includes environment flag', () => {
      const config = createMCPConfig({
        mcpServerName: 'vscode-dev-server',
        clusterId: 'dev-cluster',
        mcpServerId: 'dev-mcp',
      });

      expect(config.args).toContain('-X');
      expect(config.args).toContain('cloud_environment=integration');
      expect(config).toMatchSnapshot();
    });

    test('Cursor config includes environment flag', () => {
      const config = createMCPConfig({
        mcpServerName: 'cursor-dev-server',
        clusterId: 'dev-cluster',
        mcpServerId: 'dev-mcp',
      });

      expect(config.args).toContain('-X');
      expect(config.args).toContain('cloud_environment=integration');
      expect(config).toMatchSnapshot();
    });
  });
});

describe('getClientCommand', () => {
  const baseParams = {
    mcpServerName: 'test-server',
    clusterId: 'cluster-123',
    mcpServerId: 'mcp-456',
    isServerless: false,
  };

  describe('Production environment (no -X cloud_environment flag)', () => {
    beforeAll(() => {
      mockLocation('cloud.redpanda.com');
    });

    describe.each([
      { client: 'auggie' as const, returns: 'command' as const },
      { client: 'claude-code' as const, returns: 'command' as const, extraParams: { selectedScope: 'user' as const } },
      { client: 'codex' as const, returns: 'command' as const },
      { client: 'gemini' as const, returns: 'command' as const, extraParams: { selectedScope: 'project' as const } },
      { client: 'cursor' as const, returns: '' as const, reason: 'uses button/link approach' },
      { client: 'vscode' as const, returns: '' as const, reason: 'uses button/link approach' },
      { client: 'cline' as const, returns: '' as const, reason: 'no CLI command' },
      { client: 'manus' as const, returns: '' as const, reason: 'no CLI command' },
      { client: 'warp' as const, returns: '' as const, reason: 'no CLI command' },
      { client: 'windsurf' as const, returns: '' as const, reason: 'no CLI command' },
      { client: 'claude-desktop' as const, returns: '' as const, reason: 'uses rpk command directly' },
    ])('$client command', ({ client, returns, extraParams = {}, reason }) => {
      test(`returns ${returns}${reason ? ` (${reason})` : ''}`, () => {
        const command = getClientCommand(client, { ...baseParams, ...extraParams });
        if (returns === 'command') {
          expect(command).toMatchSnapshot();
        } else {
          expect(command).toBe('');
        }
      });
    });
  });

  describe('Non-production environment (with -X cloud_environment flag)', () => {
    beforeAll(() => {
      mockLocation('main--redpanda-cloud.netlify.app');
    });

    describe.each([
      { client: 'auggie' as const, returns: 'command' as const },
      { client: 'claude-code' as const, returns: 'command' as const },
      { client: 'codex' as const, returns: 'command' as const },
      { client: 'gemini' as const, returns: 'command' as const },
      { client: 'cursor' as const, returns: '' as const, reason: 'uses button/link approach' },
      { client: 'vscode' as const, returns: '' as const, reason: 'uses button/link approach' },
      { client: 'cline' as const, returns: '' as const, reason: 'no CLI command' },
      { client: 'manus' as const, returns: '' as const, reason: 'no CLI command' },
      { client: 'warp' as const, returns: '' as const, reason: 'no CLI command' },
      { client: 'windsurf' as const, returns: '' as const, reason: 'no CLI command' },
      { client: 'claude-desktop' as const, returns: '' as const, reason: 'uses rpk command directly' },
    ])('$client command', ({ client, returns, reason }) => {
      test(`returns ${returns}${reason ? ` (${reason})` : ''}`, () => {
        const command = getClientCommand(client, baseParams);
        if (returns === 'command') {
          expect(command).toMatchSnapshot();
        } else {
          expect(command).toBe('');
        }
      });
    });
  });

  describe('Serverless cluster flag', () => {
    beforeAll(() => {
      mockLocation('cloud.redpanda.com');
    });

    test('auggie command - serverless cluster', () => {
      const command = getClientCommand('auggie', {
        ...baseParams,
        isServerless: true,
      });
      expect(command).toMatchSnapshot();
    });

    test('codex command - regular cluster', () => {
      const command = getClientCommand('codex', {
        ...baseParams,
        isServerless: false,
      });
      expect(command).toMatchSnapshot();
    });
  });

  describe('Default scope handling', () => {
    beforeAll(() => {
      mockLocation('cloud.redpanda.com');
    });

    test('claude-code command - defaults to "local" scope when not provided', () => {
      const command = getClientCommand('claude-code', baseParams);
      expect(command).toMatchSnapshot();
    });

    test('gemini command - uses provided scope', () => {
      const command = getClientCommand('gemini', {
        ...baseParams,
        selectedScope: 'user',
      });
      expect(command).toMatchSnapshot();
    });
  });
});

describe('getClientConfig', () => {
  const baseParams = {
    mcpServerName: 'test-server',
    clusterId: 'cluster-123',
    mcpServerId: 'mcp-456',
    isServerless: false,
  };

  describe('Production environment (no -X flag)', () => {
    beforeAll(() => {
      mockLocation('cloud.redpanda.com');
    });

    describe.each([
      { client: 'auggie' as const },
      { client: 'claude-code' as const },
      { client: 'claude-desktop' as const },
      { client: 'codex' as const },
      { client: 'gemini' as const },
      { client: 'cursor' as const },
      { client: 'vscode' as const },
      { client: 'cline' as const },
      { client: 'manus' as const },
      { client: 'warp' as const },
      { client: 'windsurf' as const },
    ])('$client config', ({ client }) => {
      test('returns config', () => {
        const config = getClientConfig(client, baseParams);
        expect(config).toMatchSnapshot();
      });
    });
  });

  describe('Non-production environment (with -X cloud_environment flag)', () => {
    beforeAll(() => {
      mockLocation('main--redpanda-cloud.netlify.app');
    });

    describe.each([
      { client: 'auggie' as const },
      { client: 'claude-code' as const },
      { client: 'claude-desktop' as const },
      { client: 'codex' as const },
      { client: 'gemini' as const },
      { client: 'cursor' as const },
      { client: 'vscode' as const },
      { client: 'cline' as const },
      { client: 'manus' as const },
      { client: 'warp' as const },
      { client: 'windsurf' as const },
    ])('$client config', ({ client }) => {
      test('returns config', () => {
        const config = getClientConfig(client, baseParams);
        expect(config).toMatchSnapshot();
      });
    });
  });
});
