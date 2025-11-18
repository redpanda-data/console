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

import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import {
  GetMCPServerRequestSchema,
  GetMCPServerResponseSchema,
  MCPServer_State,
  MCPServerSchema,
  StartMCPServerRequestSchema,
  StartMCPServerResponseSchema,
  StopMCPServerRequestSchema,
  StopMCPServerResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import {
  getMCPServer,
  startMCPServer,
  stopMCPServer,
} from 'protogen/redpanda/api/dataplane/v1alpha3/mcp-MCPServerService_connectquery';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from 'test-utils';

vi.mock('config', () => ({
  config: {
    jwt: 'test-jwt-token',
  },
  isFeatureFlagEnabled: vi.fn(() => false),
}));

import { RemoteMCPToggleButton } from './remote-mcp-toggle-button';

describe('RemoteMCPToggleButton', () => {
  test('should stop a running MCP server from the details page', async () => {
    const serverId = 'server-1';
    const server = create(MCPServerSchema, {
      id: serverId,
      displayName: 'Test Server 1',
      url: 'http://localhost:8080',
      state: MCPServer_State.RUNNING,
      tools: {
        'test-tool-1': {
          componentType: 1,
          configYaml: 'test: config',
        },
      },
    });

    const getMCPServerResponse = create(GetMCPServerResponseSchema, {
      mcpServer: server,
    });

    const getMCPServerMock = vi.fn().mockReturnValue(getMCPServerResponse);
    const stopMCPServerMock = vi.fn().mockReturnValue(
      create(StopMCPServerResponseSchema, {
        mcpServer: create(MCPServerSchema, {
          ...server,
          state: MCPServer_State.STOPPED,
        }),
      })
    );

    const transport = createRouterTransport(({ rpc }) => {
      rpc(getMCPServer, getMCPServerMock);
      rpc(stopMCPServer, stopMCPServerMock);
    });

    render(
      <MemoryRouter initialEntries={[`/mcp-servers/${serverId}`]}>
        <Routes>
          <Route element={<RemoteMCPToggleButton />} path="/mcp-servers/:id" />
        </Routes>
      </MemoryRouter>,
      { transport }
    );

    await waitFor(() => {
      expect(screen.getByTestId('stop-mcp-server-button')).toBeVisible();
    });

    expect(getMCPServerMock).toHaveBeenCalledWith(
      create(GetMCPServerRequestSchema, {
        id: serverId,
      }),
      expect.anything()
    );

    const stopButton = screen.getByTestId('stop-mcp-server-button');
    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(stopMCPServerMock).toHaveBeenCalledTimes(1);
      expect(stopMCPServerMock).toHaveBeenCalledWith(
        create(StopMCPServerRequestSchema, {
          id: serverId,
        }),
        expect.anything()
      );
    });
  });

  test('should start a stopped MCP server from the details page', async () => {
    const serverId = 'server-1';
    const server = create(MCPServerSchema, {
      id: serverId,
      displayName: 'Test Server 1',
      url: 'http://localhost:8080',
      state: MCPServer_State.STOPPED,
      tools: {
        'test-tool-1': {
          componentType: 1,
          configYaml: 'test: config',
        },
      },
    });

    const getMCPServerResponse = create(GetMCPServerResponseSchema, {
      mcpServer: server,
    });

    const getMCPServerMock = vi.fn().mockReturnValue(getMCPServerResponse);
    const startMCPServerMock = vi.fn().mockReturnValue(
      create(StartMCPServerResponseSchema, {
        mcpServer: create(MCPServerSchema, {
          ...server,
          state: MCPServer_State.RUNNING,
        }),
      })
    );

    const transport = createRouterTransport(({ rpc }) => {
      rpc(getMCPServer, getMCPServerMock);
      rpc(startMCPServer, startMCPServerMock);
    });

    render(
      <MemoryRouter initialEntries={[`/mcp-servers/${serverId}`]}>
        <Routes>
          <Route element={<RemoteMCPToggleButton />} path="/mcp-servers/:id" />
        </Routes>
      </MemoryRouter>,
      { transport }
    );

    await waitFor(() => {
      expect(screen.getByTestId('start-mcp-server-button')).toBeVisible();
    });

    expect(getMCPServerMock).toHaveBeenCalledWith(
      create(GetMCPServerRequestSchema, {
        id: serverId,
      }),
      expect.anything()
    );

    const startButton = screen.getByTestId('start-mcp-server-button');
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(startMCPServerMock).toHaveBeenCalledTimes(1);
      expect(startMCPServerMock).toHaveBeenCalledWith(
        create(StartMCPServerRequestSchema, {
          id: serverId,
        }),
        expect.anything()
      );
    });
  });

  test('should disable stop button while stopping', async () => {
    const serverId = 'server-1';
    const server = create(MCPServerSchema, {
      id: serverId,
      displayName: 'Test Server 1',
      url: 'http://localhost:8080',
      state: MCPServer_State.STOPPING,
      tools: {
        'test-tool-1': {
          componentType: 1,
          configYaml: 'test: config',
        },
      },
    });

    const getMCPServerResponse = create(GetMCPServerResponseSchema, {
      mcpServer: server,
    });

    const getMCPServerMock = vi.fn().mockReturnValue(getMCPServerResponse);

    const transport = createRouterTransport(({ rpc }) => {
      rpc(getMCPServer, getMCPServerMock);
    });

    render(
      <MemoryRouter initialEntries={[`/mcp-servers/${serverId}`]}>
        <Routes>
          <Route element={<RemoteMCPToggleButton />} path="/mcp-servers/:id" />
        </Routes>
      </MemoryRouter>,
      { transport }
    );

    await waitFor(() => {
      const stopButton = screen.getByTestId('stop-mcp-server-button');
      expect(stopButton).toBeVisible();
      expect(stopButton).toBeDisabled();
    });
  });

  test('should disable start button while starting', async () => {
    const serverId = 'server-1';
    const server = create(MCPServerSchema, {
      id: serverId,
      displayName: 'Test Server 1',
      url: 'http://localhost:8080',
      state: MCPServer_State.STARTING,
      tools: {
        'test-tool-1': {
          componentType: 1,
          configYaml: 'test: config',
        },
      },
    });

    const getMCPServerResponse = create(GetMCPServerResponseSchema, {
      mcpServer: server,
    });

    const getMCPServerMock = vi.fn().mockReturnValue(getMCPServerResponse);

    const transport = createRouterTransport(({ rpc }) => {
      rpc(getMCPServer, getMCPServerMock);
    });

    render(
      <MemoryRouter initialEntries={[`/mcp-servers/${serverId}`]}>
        <Routes>
          <Route element={<RemoteMCPToggleButton />} path="/mcp-servers/:id" />
        </Routes>
      </MemoryRouter>,
      { transport }
    );

    await waitFor(() => {
      const startButton = screen.getByTestId('start-mcp-server-button');
      expect(startButton).toBeVisible();
      expect(startButton).toBeDisabled();
    });
  });

  test('should show start button for servers in error state', async () => {
    const serverId = 'server-1';
    const server = create(MCPServerSchema, {
      id: serverId,
      displayName: 'Test Server 1',
      url: 'http://localhost:8080',
      state: MCPServer_State.ERROR,
      tools: {
        'test-tool-1': {
          componentType: 1,
          configYaml: 'test: config',
        },
      },
    });

    const getMCPServerResponse = create(GetMCPServerResponseSchema, {
      mcpServer: server,
    });

    const getMCPServerMock = vi.fn().mockReturnValue(getMCPServerResponse);

    const transport = createRouterTransport(({ rpc }) => {
      rpc(getMCPServer, getMCPServerMock);
    });

    render(
      <MemoryRouter initialEntries={[`/mcp-servers/${serverId}`]}>
        <Routes>
          <Route element={<RemoteMCPToggleButton />} path="/mcp-servers/:id" />
        </Routes>
      </MemoryRouter>,
      { transport }
    );

    await waitFor(() => {
      const startButton = screen.getByRole('button', { name: 'Start' });
      expect(startButton).toBeVisible();
      expect(startButton).toBeEnabled();
    });
  });
});
