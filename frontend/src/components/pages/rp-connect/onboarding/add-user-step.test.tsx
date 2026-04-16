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
import { CreateSecretResponseSchema as CreateSecretResponseSchemaConsole } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { createSecret } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  ListACLsResponse_PolicySchema,
  ListACLsResponse_ResourceSchema,
  ListACLsResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { createACL, listACLs } from 'protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import {
  CreateUserResponseSchema,
  ListUsersResponse_UserSchema,
  ListUsersResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { createUser, listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import { useRef } from 'react';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

import type { UserStepRef } from '../types/wizard';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('config', () => ({
  config: {
    jwt: 'test-jwt-token',
    controlplaneUrl: 'http://localhost:9090',
    clusterId: 'test-cluster',
    isServerless: false,
  },
  isFeatureFlagEnabled: vi.fn(() => false),
  addBearerTokenInterceptor: vi.fn((next: unknown) => next),
}));

vi.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

// Mock generatePassword to return deterministic value
vi.mock('utils/password', () => ({
  generatePassword: vi.fn(() => 'mock-generated-password-12345'),
}));

// Mock ServiceAccountSelector with functional ref
vi.mock('components/ui/service-account/service-account-selector', () => {
  const React = require('react');
  return {
    ServiceAccountSelector: React.forwardRef((_props: unknown, ref: unknown) => {
      React.useImperativeHandle(ref, () => ({
        createServiceAccount: vi.fn().mockResolvedValue({
          serviceAccountId: 'sa-123',
          secretName: 'sa-secret',
        }),
        isPending: false,
      }));
      return React.createElement('div', { 'data-testid': 'service-account-selector' });
    }),
  };
});

// Mock TanStack Router Link
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: (props: { children: unknown }) => {
      const React = require('react');
      return React.createElement('a', { href: '#' }, props.children);
    },
  };
});

// Polyfills
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView = vi.fn();

// ── Component import (after mocks) ────────────────────────────────────────────
import { AddUserStep } from './add-user-step';

// ── Helpers ────────────────────────────────────────────────────────────────────

function TestHarness({ onResult, ...props }: { onResult: (result: unknown) => void; [key: string]: unknown }) {
  const ref = useRef<UserStepRef>(null);
  return (
    <>
      <AddUserStep hideTitle ref={ref} selectionMode="new" {...props} />
      <button
        data-testid="submit"
        onClick={async () => {
          const result = await ref.current!.triggerSubmit();
          onResult(result);
        }}
        type="button"
      >
        Submit
      </button>
    </>
  );
}

/** Build transport with common RPC mocks */
function buildTransport(overrides?: {
  listUsersMock?: ReturnType<typeof vi.fn>;
  createUserMock?: ReturnType<typeof vi.fn>;
  listACLsMock?: ReturnType<typeof vi.fn>;
  createACLMock?: ReturnType<typeof vi.fn>;
  createSecretMock?: ReturnType<typeof vi.fn>;
}) {
  const listUsersMock =
    overrides?.listUsersMock ??
    vi.fn().mockReturnValue(
      create(ListUsersResponseSchema, {
        users: [],
        nextPageToken: '',
      })
    );

  const createUserMock = overrides?.createUserMock ?? vi.fn().mockReturnValue(create(CreateUserResponseSchema, {}));

  const listACLsMock =
    overrides?.listACLsMock ?? vi.fn().mockReturnValue(create(ListACLsResponseSchema, { resources: [] }));

  const createACLMock = overrides?.createACLMock ?? vi.fn().mockReturnValue({});

  const createSecretMock =
    overrides?.createSecretMock ?? vi.fn().mockReturnValue(create(CreateSecretResponseSchemaConsole, {}));

  const transport = createRouterTransport(({ rpc }) => {
    rpc(listUsers, listUsersMock);
    rpc(createUser, createUserMock);
    rpc(listACLs, listACLsMock);
    rpc(createACL, createACLMock);
    rpc(createSecret, createSecretMock);
  });

  return {
    transport,
    listUsersMock,
    createUserMock,
    listACLsMock,
    createACLMock,
    createSecretMock,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('AddUserStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── SASL path ──────────────────────────────────────────────────────────────

  describe('SASL path', () => {
    test('1. new SASL user calls createUser RPC', async () => {
      const user = userEvent.setup();
      const { transport, createUserMock } = buildTransport();
      let capturedResult: unknown;

      renderWithFileRoutes(
        <TestHarness
          onResult={(r: unknown) => {
            capturedResult = r;
          }}
          selectionMode="new"
        />,
        { transport }
      );

      const usernameInput = await screen.findByPlaceholderText('Enter a username');
      await user.type(usernameInput, 'test-user');

      await user.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(createUserMock).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(capturedResult).toBeDefined();
        expect((capturedResult as { success: boolean }).success).toBe(true);
      });
    });

    test('2. triggerSubmit returns username and saslMechanism', async () => {
      const user = userEvent.setup();
      const { transport } = buildTransport();
      let capturedResult: unknown;

      renderWithFileRoutes(
        <TestHarness
          onResult={(r: unknown) => {
            capturedResult = r;
          }}
          selectionMode="new"
        />,
        { transport }
      );

      const usernameInput = await screen.findByPlaceholderText('Enter a username');
      await user.type(usernameInput, 'my-user');

      await user.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(capturedResult).toBeDefined();
        const result = capturedResult as { success: boolean; data?: { username: string; saslMechanism: string } };
        expect(result.success).toBe(true);
        expect(result.data?.username).toBe('my-user');
        expect(result.data?.saslMechanism).toBe('SCRAM-SHA-256');
      });
    });

    test('3. empty username rejected — triggerSubmit returns success: false', async () => {
      const user = userEvent.setup();
      const { transport } = buildTransport();
      let capturedResult: unknown;

      renderWithFileRoutes(
        <TestHarness
          onResult={(r: unknown) => {
            capturedResult = r;
          }}
          selectionMode="new"
        />,
        { transport }
      );

      // Wait for component to render
      await screen.findByPlaceholderText('Enter a username');

      // Do not type anything — submit with empty username
      await user.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(capturedResult).toBeDefined();
        expect((capturedResult as { success: boolean }).success).toBe(false);
      });
    });

    test('4. existing user skips createUser call', async () => {
      const user = userEvent.setup();
      const existingUsers = [create(ListUsersResponse_UserSchema, { name: 'existing-user' })];

      const listUsersMock = vi.fn().mockReturnValue(
        create(ListUsersResponseSchema, {
          users: existingUsers,
          nextPageToken: '',
        })
      );

      const { transport, createUserMock } = buildTransport({ listUsersMock });
      let capturedResult: unknown;

      // Use selectionMode="new" so the component renders an Input instead of Combobox.
      // Type a username that matches an existing user.
      // The component detects the existing user and skips createUser.
      renderWithFileRoutes(
        <TestHarness
          onResult={(r: unknown) => {
            capturedResult = r;
          }}
          selectionMode="new"
        />,
        { transport }
      );

      // Wait for the user list to load
      await waitFor(() => {
        expect(listUsersMock).toHaveBeenCalled();
      });

      // Type an existing username into the input
      const usernameInput = await screen.findByPlaceholderText('Enter a username');
      await user.type(usernameInput, 'existing-user');

      await user.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(capturedResult).toBeDefined();
        expect((capturedResult as { success: boolean }).success).toBe(true);
      });

      // createUser should NOT have been called for existing user
      // When selectionMode="new" but username matches existing, existingUserSelected is truthy
      // and the mutation treats it as existing user (skips createUser)
      expect(createUserMock).not.toHaveBeenCalled();
    });

    test('5. consumer group fields shown when showConsumerGroupFields=true', async () => {
      const { transport } = buildTransport();

      renderWithFileRoutes(<TestHarness onResult={() => {}} selectionMode="new" showConsumerGroupFields={true} />, {
        transport,
      });

      const consumerGroupInput = await screen.findByPlaceholderText('Enter a consumer group name');
      expect(consumerGroupInput).toBeInTheDocument();
    });

    test('6. consumer group included in submission result', async () => {
      const user = userEvent.setup();
      const { transport, createUserMock } = buildTransport();
      let capturedResult: unknown;

      renderWithFileRoutes(
        <TestHarness
          onResult={(r: unknown) => {
            capturedResult = r;
          }}
          selectionMode="new"
          showConsumerGroupFields={true}
        />,
        { transport }
      );

      const usernameInput = await screen.findByPlaceholderText('Enter a username');
      await user.type(usernameInput, 'cg-user');

      const cgInput = screen.getByPlaceholderText('Enter a consumer group name');
      await user.type(cgInput, 'my-consumer-group');

      await user.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(createUserMock).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(capturedResult).toBeDefined();
        const result = capturedResult as { success: boolean; data?: { consumerGroup: string } };
        expect(result.success).toBe(true);
        // The consumer group is passed through the mutation, verify createUser was called
        expect(result.data?.consumerGroup).toBe('my-consumer-group');
      });
    });
  });

  // ── Service Account path ───────────────────────────────────────────────────

  describe('Service Account path', () => {
    test('7. SA tab switches auth mode', async () => {
      const user = userEvent.setup();
      const { transport } = buildTransport();

      renderWithFileRoutes(<TestHarness onResult={() => {}} selectionMode="new" />, { transport });

      // Wait for component to render
      await screen.findByText('SASL User');

      // Click the Service Account tab
      const saTab = screen.getByText('Service Account');
      await user.click(saTab);

      // Service Account form should be visible
      await waitFor(() => {
        expect(screen.getByTestId('service-account-selector')).toBeInTheDocument();
      });
    });

    test('8. SA name auto-generated from pipelineName', async () => {
      const user = userEvent.setup();
      const { transport } = buildTransport();

      renderWithFileRoutes(<TestHarness onResult={() => {}} pipelineName="my-pipe" selectionMode="new" />, {
        transport,
      });

      // Switch to Service Account tab
      const saTab = await screen.findByText('Service Account');
      await user.click(saTab);

      await waitFor(() => {
        const nameInput = screen.getByLabelText('Service Account Name') as HTMLInputElement;
        // The generateServiceAccountName with pipelineName='my-pipe' should contain 'my-pipe'
        expect(nameInput.value).toContain('my-pipe');
      });
    });

    test('9. SA triggerSubmit returns SA data', async () => {
      const user = userEvent.setup();
      const { transport } = buildTransport();
      let capturedResult: unknown;

      renderWithFileRoutes(
        <TestHarness
          onResult={(r: unknown) => {
            capturedResult = r;
          }}
          pipelineName="test-pipeline"
          selectionMode="new"
        />,
        { transport }
      );

      // Switch to Service Account tab
      const saTab = await screen.findByText('Service Account');
      await user.click(saTab);

      await waitFor(() => {
        expect(screen.getByTestId('service-account-selector')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(capturedResult).toBeDefined();
        const result = capturedResult as {
          success: boolean;
          data?: { authMethod: string; serviceAccountId: string };
        };
        expect(result.success).toBe(true);
        expect(result.data?.authMethod).toBe('service-account');
        expect(result.data?.serviceAccountId).toBe('sa-123');
      });
    });
  });

  // ── Permissions ────────────────────────────────────────────────────────────

  describe('Permissions', () => {
    test('10. missing permissions alert for existing user', async () => {
      const user = userEvent.setup();
      const existingUsers = [create(ListUsersResponse_UserSchema, { name: 'no-perms-user' })];

      const listUsersMock = vi.fn().mockReturnValue(
        create(ListUsersResponseSchema, {
          users: existingUsers,
          nextPageToken: '',
        })
      );

      // Return empty ACLs — user has no permissions
      const listACLsMock = vi.fn().mockReturnValue(create(ListACLsResponseSchema, { resources: [] }));

      const { transport } = buildTransport({ listUsersMock, listACLsMock });

      // Use selectionMode="new" and type username that matches existing user.
      // The component detects existingUserSelected and shows the permission alert
      // when selectionMode="both" userSelectionType=CREATE and user exists.
      // But for the destructive alert, it requires selectionMode="existing"
      // (userSelectionType=EXISTING). Use defaultUsername to pre-fill.
      renderWithFileRoutes(
        <TestHarness
          defaultUsername="no-perms-user"
          onResult={() => {}}
          selectionMode="existing"
          topicName="my-topic"
        />,
        { transport }
      );

      // Wait for user list to load so existingUserSelected is computed
      await waitFor(() => {
        expect(listUsersMock).toHaveBeenCalled();
      });

      // With defaultUsername pre-filled, the component should detect the existing
      // user and fire the ACL query. Wait for the missing permissions alert.
      await waitFor(
        () => {
          expect(screen.getByText(/does not have required permissions/i)).toBeInTheDocument();
        },
        { timeout: 5000 }
      );
    });

    test('11. has permissions alert when user has ACLs', async () => {
      const existingUsers = [create(ListUsersResponse_UserSchema, { name: 'perms-user' })];

      const listUsersMock = vi.fn().mockReturnValue(
        create(ListUsersResponseSchema, {
          users: existingUsers,
          nextPageToken: '',
        })
      );

      // Return ACLs with READ and WRITE permissions
      const listACLsMock = vi.fn().mockReturnValue(
        create(ListACLsResponseSchema, {
          resources: [
            create(ListACLsResponse_ResourceSchema, {
              resourceType: ACL_ResourceType.TOPIC,
              resourceName: 'my-topic',
              resourcePatternType: ACL_ResourcePatternType.LITERAL,
              acls: [
                create(ListACLsResponse_PolicySchema, {
                  principal: 'User:perms-user',
                  host: '*',
                  operation: ACL_Operation.READ,
                  permissionType: ACL_PermissionType.ALLOW,
                }),
                create(ListACLsResponse_PolicySchema, {
                  principal: 'User:perms-user',
                  host: '*',
                  operation: ACL_Operation.WRITE,
                  permissionType: ACL_PermissionType.ALLOW,
                }),
              ],
            }),
          ],
        })
      );

      const { transport } = buildTransport({ listUsersMock, listACLsMock });

      // Use defaultUsername to pre-fill the existing user selection
      renderWithFileRoutes(
        <TestHarness defaultUsername="perms-user" onResult={() => {}} selectionMode="existing" topicName="my-topic" />,
        { transport }
      );

      // Wait for user list to load
      await waitFor(() => {
        expect(listUsersMock).toHaveBeenCalled();
      });

      // Should show success alert about having permissions
      await waitFor(
        () => {
          expect(screen.getByText(/has required permissions/i)).toBeInTheDocument();
        },
        { timeout: 5000 }
      );
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    test('12. isPending accessible via ref', async () => {
      const user = userEvent.setup();
      const { transport } = buildTransport();
      let refValue: UserStepRef | null = null;

      function RefCapture() {
        const ref = useRef<UserStepRef>(null);
        return (
          <>
            <AddUserStep hideTitle ref={ref} selectionMode="new" />
            <button
              data-testid="capture-ref"
              onClick={() => {
                refValue = ref.current;
              }}
              type="button"
            >
              Capture
            </button>
          </>
        );
      }

      renderWithFileRoutes(<RefCapture />, { transport });

      // Wait for render
      await screen.findByPlaceholderText('Enter a username');

      await user.click(screen.getByTestId('capture-ref'));

      expect(refValue).not.toBeNull();
      expect(refValue!.isPending).toBe(false);
      expect(typeof refValue!.triggerSubmit).toBe('function');
    });
  });
});
