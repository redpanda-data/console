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
import userEvent from '@testing-library/user-event';
import {
  DeleteMCPServerRequestSchema,
  DeleteMCPServerResponseSchema,
  ListMCPServersResponseSchema,
  MCPServer_State,
  MCPServerSchema,
  StartMCPServerRequestSchema,
  StartMCPServerResponseSchema,
  StopMCPServerRequestSchema,
  StopMCPServerResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/mcp_pb';
import {
  deleteMCPServer,
  listMCPServers,
  startMCPServer,
  stopMCPServer,
} from 'protogen/redpanda/api/dataplane/v1/mcp-MCPServerService_connectquery';
import { renderWithFileRoutes, screen, waitFor, within } from 'test-utils';

vi.mock('config', () => ({
  config: {
    jwt: 'test-jwt-token',
    controlplaneUrl: 'http://localhost:9090',
  },
  isFeatureFlagEnabled: vi.fn(() => false),
  addBearerTokenInterceptor: vi.fn((next) => async (request: unknown) => await next(request)),
}));

vi.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

Element.prototype.scrollIntoView = vi.fn();

import { RemoteMCPListPage } from './remote-mcp-list-page';

const OPEN_MENU_REGEX = /open menu/i;
const DELETE_CONFIRMATION_REGEX = /you are about to delete/i;
const TYPE_DELETE_REGEX = /type "delete" to confirm/i;
const DELETE_BUTTON_REGEX = /^delete$/i;
const LOADING_SERVERS_REGEX = /loading mcp servers/i;

const createMCPServersTransport = (options: {
  listMCPServersMock: ReturnType<typeof vi.fn>;
  deleteMCPServerMock?: ReturnType<typeof vi.fn>;
  startMCPServerMock?: ReturnType<typeof vi.fn>;
  stopMCPServerMock?: ReturnType<typeof vi.fn>;
}) =>
  createRouterTransport(({ rpc }) => {
    rpc(listMCPServers, options.listMCPServersMock);
    if (options.deleteMCPServerMock) {
      rpc(deleteMCPServer, options.deleteMCPServerMock);
    }
    if (options.startMCPServerMock) {
      rpc(startMCPServer, options.startMCPServerMock);
    }
    if (options.stopMCPServerMock) {
      rpc(stopMCPServer, options.stopMCPServerMock);
    }
  });

describe('RemoteMCPListPage', () => {
  test('should list all MCP servers', async () => {
    const server1 = create(MCPServerSchema, {
      id: 'server-1',
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

    const server2 = create(MCPServerSchema, {
      id: 'server-2',
      displayName: 'Test Server 2',
      url: 'http://localhost:8081',
      state: MCPServer_State.STOPPED,
      tools: {
        'test-tool-2': {
          componentType: 2,
          configYaml: 'test: config2',
        },
      },
    });

    const listMCPServersResponse = create(ListMCPServersResponseSchema, {
      mcpServers: [server1, server2],
      nextPageToken: '',
    });

    const listMCPServersMock = vi.fn().mockReturnValue(listMCPServersResponse);

    const transport = createMCPServersTransport({ listMCPServersMock });

    renderWithFileRoutes(<RemoteMCPListPage />, { transport });

    await waitFor(() => {
      expect(screen.getByText('Test Server 1')).toBeVisible();
      expect(screen.getByText('Test Server 2')).toBeVisible();
    });

    expect(listMCPServersMock).toHaveBeenCalledTimes(1);

    expect(screen.getByText('test-tool-1')).toBeVisible();
    expect(screen.getByText('test-tool-2')).toBeVisible();

    expect(screen.getByText('Running')).toBeVisible();
    expect(screen.getByText('Stopped')).toBeVisible();
  });

  test('should delete an MCP server from the list', async () => {
    const user = userEvent.setup();

    const server1 = create(MCPServerSchema, {
      id: 'server-1',
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

    const listMCPServersResponse = create(ListMCPServersResponseSchema, {
      mcpServers: [server1],
      nextPageToken: '',
    });

    const listMCPServersMock = vi.fn().mockReturnValue(listMCPServersResponse);
    const deleteMCPServerMock = vi.fn().mockReturnValue(create(DeleteMCPServerResponseSchema, {}));

    const transport = createMCPServersTransport({ listMCPServersMock, deleteMCPServerMock });

    renderWithFileRoutes(<RemoteMCPListPage />, { transport });

    await waitFor(() => {
      expect(screen.getByText('Test Server 1')).toBeVisible();
    });

    const rows = screen.getAllByRole('row');
    const serverRow = rows.find((row) => within(row).queryByText('Test Server 1'));
    expect(serverRow).toBeDefined();

    if (!serverRow) {
      throw new Error('Server row not found');
    }

    const actionsButton = within(serverRow).getByRole('button', { name: OPEN_MENU_REGEX });
    await user.click(actionsButton);

    const deleteButton = await screen.findByText('Delete', {}, { timeout: 3000 });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText(DELETE_CONFIRMATION_REGEX)).toBeVisible();
    });

    const confirmationInput = screen.getByPlaceholderText(TYPE_DELETE_REGEX);
    await user.type(confirmationInput, 'delete');

    const confirmButton = screen.getByRole('button', { name: DELETE_BUTTON_REGEX });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(deleteMCPServerMock).toHaveBeenCalledTimes(1);
      expect(deleteMCPServerMock).toHaveBeenCalledWith(
        create(DeleteMCPServerRequestSchema, {
          id: 'server-1',
        }),
        expect.anything()
      );
    });
  });

  test('should stop a running MCP server from the list', async () => {
    const user = userEvent.setup();

    const server1 = create(MCPServerSchema, {
      id: 'server-1',
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

    const listMCPServersResponse = create(ListMCPServersResponseSchema, {
      mcpServers: [server1],
      nextPageToken: '',
    });

    const listMCPServersMock = vi.fn().mockReturnValue(listMCPServersResponse);
    const stopMCPServerMock = vi.fn().mockReturnValue(
      create(StopMCPServerResponseSchema, {
        mcpServer: create(MCPServerSchema, {
          ...server1,
          state: MCPServer_State.STOPPED,
        }),
      })
    );

    const transport = createMCPServersTransport({ listMCPServersMock, stopMCPServerMock });

    renderWithFileRoutes(<RemoteMCPListPage />, { transport });

    await waitFor(() => {
      expect(screen.getByText('Test Server 1')).toBeVisible();
      expect(screen.getByText('Running')).toBeVisible();
    });

    const rows = screen.getAllByRole('row');
    const serverRow = rows.find((row) => within(row).queryByText('Test Server 1'));
    expect(serverRow).toBeDefined();

    if (!serverRow) {
      throw new Error('Server row not found');
    }

    const actionsButton = within(serverRow).getByRole('button', { name: OPEN_MENU_REGEX });
    await user.click(actionsButton);

    const stopMenuItem = await screen.findByTestId('stop-server-menu-item', {}, { timeout: 3000 });
    await user.click(stopMenuItem);

    await waitFor(() => {
      expect(stopMCPServerMock).toHaveBeenCalledTimes(1);
      expect(stopMCPServerMock).toHaveBeenCalledWith(
        create(StopMCPServerRequestSchema, {
          id: 'server-1',
        }),
        expect.anything()
      );
    });
  });

  test('should start a stopped MCP server from the list', async () => {
    const user = userEvent.setup();

    const server1 = create(MCPServerSchema, {
      id: 'server-1',
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

    const listMCPServersResponse = create(ListMCPServersResponseSchema, {
      mcpServers: [server1],
      nextPageToken: '',
    });

    const listMCPServersMock = vi.fn().mockReturnValue(listMCPServersResponse);
    const startMCPServerMock = vi.fn().mockReturnValue(
      create(StartMCPServerResponseSchema, {
        mcpServer: create(MCPServerSchema, {
          ...server1,
          state: MCPServer_State.RUNNING,
        }),
      })
    );

    const transport = createMCPServersTransport({ listMCPServersMock, startMCPServerMock });

    renderWithFileRoutes(<RemoteMCPListPage />, { transport });

    await waitFor(() => {
      expect(screen.getByText('Test Server 1')).toBeVisible();
      expect(screen.getByText('Stopped')).toBeVisible();
    });

    const rows = screen.getAllByRole('row');
    const serverRow = rows.find((row) => within(row).queryByText('Test Server 1'));
    expect(serverRow).toBeDefined();

    if (!serverRow) {
      throw new Error('Server row not found');
    }

    const actionsButton = within(serverRow).getByRole('button', { name: OPEN_MENU_REGEX });
    await user.click(actionsButton);

    const startMenuItem = await screen.findByTestId('start-server-menu-item', {}, { timeout: 3000 });
    await user.click(startMenuItem);

    await waitFor(() => {
      expect(startMCPServerMock).toHaveBeenCalledTimes(1);
      expect(startMCPServerMock).toHaveBeenCalledWith(
        create(StartMCPServerRequestSchema, {
          id: 'server-1',
        }),
        expect.anything()
      );
    });
  });

  test('should display loading state when fetching servers', async () => {
    const listMCPServersMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(
              create(ListMCPServersResponseSchema, {
                mcpServers: [],
                nextPageToken: '',
              })
            );
          }, 100);
        })
    );

    const transport = createMCPServersTransport({ listMCPServersMock });

    renderWithFileRoutes(<RemoteMCPListPage />, { transport });

    expect(screen.getByText(LOADING_SERVERS_REGEX)).toBeVisible();

    await waitFor(() => {
      expect(screen.queryByText(LOADING_SERVERS_REGEX)).not.toBeInTheDocument();
    });
  });

  test('should display empty state when no servers exist', async () => {
    const listMCPServersResponse = create(ListMCPServersResponseSchema, {
      mcpServers: [],
      nextPageToken: '',
    });

    const listMCPServersMock = vi.fn().mockReturnValue(listMCPServersResponse);

    const transport = createMCPServersTransport({ listMCPServersMock });

    renderWithFileRoutes(<RemoteMCPListPage />, { transport });

    await waitFor(() => {
      expect(screen.getByText('No MCP servers found.')).toBeVisible();
    });
  });

  test('should update pagination footer and disable next button on the last page', async () => {
    const user = userEvent.setup();
    const mcpServers = Array.from({ length: 25 }, (_, index) =>
      create(MCPServerSchema, {
        id: `server-${index + 1}`,
        displayName: `Test Server ${index + 1}`,
        url: `http://localhost:${8080 + index}`,
        state: MCPServer_State.RUNNING,
        tools: {
          [`test-tool-${index + 1}`]: {
            componentType: 1,
            configYaml: `test: config-${index + 1}`,
          },
        },
      })
    );

    const listMCPServersResponse = create(ListMCPServersResponseSchema, {
      mcpServers,
      nextPageToken: '',
    });

    const listMCPServersMock = vi.fn().mockReturnValue(listMCPServersResponse);
    const transport = createMCPServersTransport({ listMCPServersMock });

    renderWithFileRoutes(<RemoteMCPListPage />, { transport });

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 3')).toBeVisible();
    });

    const previousButton = screen.getByRole('button', { name: 'Previous Page' });
    const nextButton = screen.getByRole('button', { name: 'Next Page' });

    expect(previousButton).toBeDisabled();
    expect(nextButton).toBeEnabled();

    await user.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('Page 2 of 3')).toBeVisible();
    });

    expect(screen.getByRole('button', { name: 'Previous Page' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Next Page' }));

    await waitFor(() => {
      expect(screen.getByText('Page 3 of 3')).toBeVisible();
    });

    expect(screen.getByRole('button', { name: 'Next Page' })).toBeDisabled();
  });

  test('search input updates value on keystrokes', async () => {
    const user = userEvent.setup();

    const server1 = create(MCPServerSchema, {
      id: 'server-1',
      displayName: 'Test Server',
      url: 'http://localhost:8080',
      state: MCPServer_State.RUNNING,
      tools: {},
    });

    const transport = createMCPServersTransport({
      listMCPServersMock: vi
        .fn()
        .mockReturnValue(create(ListMCPServersResponseSchema, { mcpServers: [server1], nextPageToken: '' })),
    });

    renderWithFileRoutes(<RemoteMCPListPage />, { transport });

    await waitFor(() => {
      expect(screen.getByText('Test Server')).toBeVisible();
    });

    const filterInput = screen.getByPlaceholderText('Filter servers...');
    await user.type(filterInput, 'hello');

    // Input value must reflect typed text — a React Compiler memoization
    // bug would freeze it at the initial empty string.
    expect(filterInput).toHaveValue('hello');
  });

  test('filters servers by name via search input', async () => {
    const user = userEvent.setup();

    const server1 = create(MCPServerSchema, {
      id: 'server-1',
      displayName: 'Alpha Server',
      url: 'http://localhost:8080',
      state: MCPServer_State.RUNNING,
      tools: {},
    });

    const server2 = create(MCPServerSchema, {
      id: 'server-2',
      displayName: 'Beta Server',
      url: 'http://localhost:8081',
      state: MCPServer_State.STOPPED,
      tools: {},
    });

    const transport = createMCPServersTransport({
      listMCPServersMock: vi
        .fn()
        .mockReturnValue(create(ListMCPServersResponseSchema, { mcpServers: [server1, server2], nextPageToken: '' })),
    });

    renderWithFileRoutes(<RemoteMCPListPage />, { transport });

    await waitFor(() => {
      expect(screen.getByText('Alpha Server')).toBeVisible();
      expect(screen.getByText('Beta Server')).toBeVisible();
    });

    const filterInput = screen.getByPlaceholderText('Filter servers...');
    await user.type(filterInput, 'Beta');

    await waitFor(() => {
      expect(screen.getByText('Beta Server')).toBeVisible();
      expect(screen.queryByText('Alpha Server')).not.toBeInTheDocument();
    });

    // Clear and verify all rows reappear
    await user.clear(filterInput);

    await waitFor(() => {
      expect(screen.getByText('Alpha Server')).toBeVisible();
      expect(screen.getByText('Beta Server')).toBeVisible();
    });
  });

  test('status faceted filter filters results', async () => {
    const user = userEvent.setup();

    const server1 = create(MCPServerSchema, {
      id: 'server-1',
      displayName: 'Running Server',
      url: 'http://localhost:8080',
      state: MCPServer_State.RUNNING,
      tools: {},
    });

    const server2 = create(MCPServerSchema, {
      id: 'server-2',
      displayName: 'Stopped Server',
      url: 'http://localhost:8081',
      state: MCPServer_State.STOPPED,
      tools: {},
    });

    const transport = createMCPServersTransport({
      listMCPServersMock: vi
        .fn()
        .mockReturnValue(create(ListMCPServersResponseSchema, { mcpServers: [server1, server2], nextPageToken: '' })),
    });

    renderWithFileRoutes(<RemoteMCPListPage />, { transport });

    await waitFor(() => {
      expect(screen.getByText('Running Server')).toBeVisible();
      expect(screen.getByText('Stopped Server')).toBeVisible();
    });

    // Click the "Status" faceted filter button (not the column header one in <thead>)
    const statusFilterButton = screen.getAllByRole('button', { name: /status/i }).find((btn) => !btn.closest('thead'))!;
    await user.click(statusFilterButton);

    // Select the "Running" option from the filter popover
    const runningOption = await screen.findByRole('option', { name: /running/i });
    await user.click(runningOption);

    // Only the running server should remain visible
    await waitFor(() => {
      expect(screen.getByText('Running Server')).toBeVisible();
      expect(screen.queryByText('Stopped Server')).not.toBeInTheDocument();
    });
  });
});
