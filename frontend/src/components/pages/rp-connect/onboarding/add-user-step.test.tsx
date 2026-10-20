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
import { beforeEach, describe, expect, test } from '@rstest/core';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CreateSecretResponseSchema as CreateSecretResponseSchemaConsole,
  ListSecretsResponseSchema as ListSecretsResponseSchemaConsole,
} from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { createSecret, listSecrets } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
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
import { ListSecretsResponseSchema, SecretSchema } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import {
  CreateUserResponseSchema,
  ListUsersResponse_UserSchema,
  ListUsersResponseSchema,
  SASLMechanism,
} from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { createUser, listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import { useRef } from 'react';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

import type { UserStepRef } from '../types/wizard';

// ── Mocks ──────────────────────────────────────────────────────────────────────

rs.mock('config', () => ({
  config: {
    jwt: 'test-jwt-token',
    controlplaneUrl: 'http://localhost:9090',
    clusterId: 'test-cluster',
    isServerless: false,
  },
  isFeatureFlagEnabled: rs.fn(() => false),
  addBearerTokenInterceptor: rs.fn((next: unknown) => next),
}));

rs.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

// Mock generatePassword to return deterministic value
rs.mock('utils/password', () => ({
  generatePassword: rs.fn(() => 'mock-generated-password-12345'),
}));

// Mock ServiceAccountSelector with functional ref
rs.mock('components/ui/service-account/service-account-selector', () => {
  const React = require('react');
  return {
    ServiceAccountSelector: React.forwardRef((_props: unknown, ref: unknown) => {
      React.useImperativeHandle(ref, () => ({
        createServiceAccount: rs.fn().mockResolvedValue({
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
rs.mock('@tanstack/react-router', () => {
  const actual = rs.requireActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');
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
Element.prototype.scrollIntoView = rs.fn();

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
  listUsersMock?: ReturnType<typeof rs.fn>;
  createUserMock?: ReturnType<typeof rs.fn>;
  listACLsMock?: ReturnType<typeof rs.fn>;
  createACLMock?: ReturnType<typeof rs.fn>;
  createSecretMock?: ReturnType<typeof rs.fn>;
  listSecretsMock?: ReturnType<typeof rs.fn>;
}) {
  const listUsersMock =
    overrides?.listUsersMock ??
    rs.fn().mockReturnValue(
      create(ListUsersResponseSchema, {
        users: [],
        nextPageToken: '',
      })
    );

  const createUserMock = overrides?.createUserMock ?? rs.fn().mockReturnValue(create(CreateUserResponseSchema, {}));

  const listACLsMock =
    overrides?.listACLsMock ?? rs.fn().mockReturnValue(create(ListACLsResponseSchema, { resources: [] }));

  const createACLMock = overrides?.createACLMock ?? rs.fn().mockReturnValue({});

  const createSecretMock =
    overrides?.createSecretMock ?? rs.fn().mockReturnValue(create(CreateSecretResponseSchemaConsole, {}));

  const transport = createRouterTransport(({ rpc }) => {
    rpc(listUsers, listUsersMock);
    rpc(createUser, createUserMock);
    rpc(listACLs, listACLsMock);
    rpc(createACL, createACLMock);
    rpc(createSecret, createSecretMock);
    if (overrides?.listSecretsMock) {
      rpc(listSecrets, overrides.listSecretsMock);
    }
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

const ALREADY_EXISTS = /already exists/;
const HAS_TOPIC_ACCESS = /has required permissions/i;

describe('AddUserStep', () => {
  beforeEach(() => {
    rs.clearAllMocks();
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
      // Assertion is "createUser RPC called with name" — skip char-by-char typing.
      fireEvent.input(usernameInput, { target: { value: 'test-user' } });

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

      const listUsersMock = rs.fn().mockReturnValue(
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

  // An input connecting as this user reads through its consumer group, so starting from the
  // pipeline's group has to end in that group being granted.
  describe('Consumer group from the pipeline', () => {
    test('grants the consumer group the dialog starts with', async () => {
      const user = userEvent.setup();
      const { transport, createACLMock } = buildTransport();

      renderWithFileRoutes(
        <TestHarness
          defaultConsumerGroup="orders-readers"
          onResult={rs.fn()}
          selectionMode="new"
          showConsumerGroupFields={true}
          topicName="orders"
        />,
        { transport }
      );

      expect(await screen.findByPlaceholderText('Enter a consumer group name')).toHaveValue('orders-readers');
      await user.type(screen.getByPlaceholderText('Enter a username'), 'orders-reader');
      await user.click(screen.getByTestId('submit'));

      await waitFor(() =>
        expect(createACLMock.mock.calls.some(([request]) => request.resourceName === 'orders-readers')).toBe(true)
      );
    });
  });

  // ── Service Account path ───────────────────────────────────────────────────

  describe('Service Account path', () => {
    test('7. SA tab switches auth mode', async () => {
      const user = userEvent.setup();
      const { transport } = buildTransport();

      renderWithFileRoutes(<TestHarness onResult={() => {}} selectionMode="new" />, { transport });

      // Wait for component to render
      await screen.findByText('SASL user');

      // Click the Service Account tab
      const saTab = screen.getByText('Service account');
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
      const saTab = await screen.findByText('Service account');
      await user.click(saTab);

      await waitFor(() => {
        const nameInput = screen.getByLabelText('Service account name') as HTMLInputElement;
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
      const saTab = await screen.findByText('Service account');
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

    // Connect logs every service-account component in as the pipeline's one account, so a second one
    // would replace it for all of them and orphan the first.
    test('keeps the pipeline service account instead of creating another', async () => {
      const user = userEvent.setup();
      const { transport } = buildTransport();
      let capturedResult: unknown;

      renderWithFileRoutes(
        <TestHarness
          hasServiceAccount
          onResult={(r: unknown) => {
            capturedResult = r;
          }}
          pipelineName="test-pipeline"
          selectionMode="new"
        />,
        { transport }
      );

      await user.click(await screen.findByText('Service account'));

      expect(await screen.findByText("Uses this pipeline's service account")).toBeInTheDocument();
      expect(screen.queryByTestId('service-account-selector')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Service account name')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('submit'));

      await waitFor(() =>
        expect(capturedResult).toEqual({ success: true, data: { authMethod: 'service-account', existing: true } })
      );
    });
  });

  // A component logs in as the user it's given, so an existing one has to work as configured.
  describe('Existing user', () => {
    const existingUser = () =>
      rs.fn().mockReturnValue(
        create(ListUsersResponseSchema, {
          users: [
            create(ListUsersResponse_UserSchema, {
              name: 'existing-user',
              mechanism: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512,
            }),
          ],
        })
      );
    const storedSecrets = (...ids: string[]) =>
      rs.fn().mockReturnValue(
        create(ListSecretsResponseSchemaConsole, {
          response: create(ListSecretsResponseSchema, { secrets: ids.map((id) => create(SecretSchema, { id })) }),
        })
      );

    test('logs in with the mechanism the user was created with', async () => {
      const user = userEvent.setup();
      const { transport } = buildTransport({ listUsersMock: existingUser() });
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

      await user.type(await screen.findByPlaceholderText('Enter a username'), 'existing-user');
      await screen.findByText(ALREADY_EXISTS);
      await user.click(screen.getByTestId('submit'));

      await waitFor(() =>
        expect(capturedResult).toMatchObject({ success: true, data: { saslMechanism: 'SCRAM-SHA-512' } })
      );
    });

    // Its password isn't known here, so the pipeline can only use secrets stored when it was created.
    test.each([
      ['none', [], 'KAFKA_USER_EXISTING_USER and KAFKA_PASSWORD_EXISTING_USER secrets, which'],
      ['only the username', ['KAFKA_USER_EXISTING_USER'], 'with the KAFKA_PASSWORD_EXISTING_USER secret, which'],
    ])('names the credential secrets it lacks when %s are stored', async (_case, ids, named) => {
      const user = userEvent.setup();
      const { transport } = buildTransport({ listUsersMock: existingUser(), listSecretsMock: storedSecrets(...ids) });

      renderWithFileRoutes(<TestHarness onResult={rs.fn()} selectionMode="new" />, { transport });

      await user.type(await screen.findByPlaceholderText('Enter a username'), 'existing-user');
      expect(await screen.findByText('No stored credentials for this user')).toBeInTheDocument();
      expect(screen.getByText(new RegExp(named))).toBeInTheDocument();
    });
  });

  // ── Permissions ────────────────────────────────────────────────────────────

  describe('Permissions', () => {
    const userWithoutAccess = () =>
      rs
        .fn()
        .mockReturnValue(
          create(ListUsersResponseSchema, { users: [create(ListUsersResponse_UserSchema, { name: 'no-perms-user' })] })
        );
    const topicGrants = (createACLMock: ReturnType<typeof rs.fn>) =>
      createACLMock.mock.calls.filter(([request]) => request.resourceName === 'my-topic');

    // A reused user has to end up able to use the topic, as a new one does.
    test.each(['existing', 'new'] as const)(
      '10. grants an existing user without access the topic (%s tab)',
      async (selectionMode) => {
        const user = userEvent.setup();
        const { transport, listACLsMock, createACLMock, createUserMock, createSecretMock } = buildTransport({
          listUsersMock: userWithoutAccess(),
        });
        let capturedResult: unknown;

        renderWithFileRoutes(
          <TestHarness
            defaultUsername="no-perms-user"
            onResult={(r: unknown) => {
              capturedResult = r;
            }}
            selectionMode={selectionMode}
            topicName="my-topic"
          />,
          { transport }
        );

        // The topic's ACLs are only fetched once the name resolves to an existing user.
        await waitFor(() => expect(listACLsMock).toHaveBeenCalled());
        expect(await screen.findByRole('checkbox', { name: 'Grant this user full access to my-topic' })).toBeChecked();
        await user.click(screen.getByTestId('submit'));

        await waitFor(() => expect(capturedResult).toMatchObject({ success: true }));
        expect(topicGrants(createACLMock)).toEqual([
          [
            expect.objectContaining({ principal: 'User:no-perms-user', operation: ACL_Operation.ALL }),
            expect.anything(),
          ],
        ]);
        expect(createUserMock).not.toHaveBeenCalled();
        expect(createSecretMock).not.toHaveBeenCalled();
      }
    );

    test("10b. leaves an existing user's access alone when the grant is unticked", async () => {
      const user = userEvent.setup();
      const { transport, listACLsMock, createACLMock } = buildTransport({ listUsersMock: userWithoutAccess() });
      let capturedResult: unknown;

      renderWithFileRoutes(
        <TestHarness
          defaultUsername="no-perms-user"
          onResult={(r: unknown) => {
            capturedResult = r;
          }}
          selectionMode="existing"
          topicName="my-topic"
        />,
        { transport }
      );

      await waitFor(() => expect(listACLsMock).toHaveBeenCalled());
      await user.click(await screen.findByRole('checkbox', { name: 'Grant this user full access to my-topic' }));
      expect(await screen.findByText('User will not be able to read from topic')).toBeInTheDocument();
      await user.click(screen.getByTestId('submit'));

      await waitFor(() => expect(capturedResult).toMatchObject({ success: true }));
      expect(topicGrants(createACLMock)).toEqual([]);
    });

    test('11. has permissions alert when user has ACLs', async () => {
      const user = userEvent.setup();
      const existingUsers = [create(ListUsersResponse_UserSchema, { name: 'perms-user' })];

      const listUsersMock = rs.fn().mockReturnValue(
        create(ListUsersResponseSchema, {
          users: existingUsers,
          nextPageToken: '',
        })
      );

      // Return ACLs with READ and WRITE permissions
      const listACLsMock = rs.fn().mockReturnValue(
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

      const { transport, createACLMock } = buildTransport({ listUsersMock, listACLsMock });
      let capturedResult: unknown;

      // Use defaultUsername to pre-fill the existing user selection
      renderWithFileRoutes(
        <TestHarness
          defaultUsername="perms-user"
          onResult={(r: unknown) => {
            capturedResult = r;
          }}
          selectionMode="existing"
          topicName="my-topic"
        />,
        { transport }
      );

      // Wait for user list to load
      await waitFor(() => {
        expect(listUsersMock).toHaveBeenCalled();
      });

      // Should show success alert about having permissions
      await waitFor(
        () => {
          expect(screen.getByText(HAS_TOPIC_ACCESS)).toBeInTheDocument();
        },
        { timeout: 5000 }
      );

      // Nothing to grant, so nothing is offered or created.
      expect(screen.queryByRole('checkbox', { name: 'Grant this user full access to my-topic' })).toBeNull();
      await user.click(screen.getByTestId('submit'));
      await waitFor(() => expect(capturedResult).toMatchObject({ success: true }));
      expect(topicGrants(createACLMock)).toEqual([]);
    });
    test.each([
      ['a prefixed', 'my-', ACL_ResourcePatternType.PREFIXED],
      ['a wildcard', '*', ACL_ResourcePatternType.LITERAL],
    ])('11b. counts %s ACL that covers the topic as access', async (_case, resourceName, resourcePatternType) => {
      const listUsersMock = rs
        .fn()
        .mockReturnValue(
          create(ListUsersResponseSchema, { users: [create(ListUsersResponse_UserSchema, { name: 'perms-user' })] })
        );
      const listACLsMock = rs.fn().mockReturnValue(
        create(ListACLsResponseSchema, {
          resources: [
            create(ListACLsResponse_ResourceSchema, {
              resourceType: ACL_ResourceType.TOPIC,
              resourceName,
              resourcePatternType,
              acls: [
                create(ListACLsResponse_PolicySchema, {
                  principal: 'User:perms-user',
                  host: '*',
                  operation: ACL_Operation.ALL,
                  permissionType: ACL_PermissionType.ALLOW,
                }),
              ],
            }),
          ],
        })
      );
      const { transport } = buildTransport({ listUsersMock, listACLsMock });

      renderWithFileRoutes(
        <TestHarness defaultUsername="perms-user" onResult={rs.fn()} selectionMode="existing" topicName="my-topic" />,
        { transport }
      );

      expect(await screen.findByText(HAS_TOPIC_ACCESS)).toBeInTheDocument();
      expect(screen.queryByRole('checkbox', { name: 'Grant this user full access to my-topic' })).toBeNull();
      expect(listACLsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: expect.objectContaining({ resourcePatternType: ACL_ResourcePatternType.MATCH }),
        }),
        expect.anything()
      );
    });

    // The grant is ALL, so a user who can already do what the component needs mustn't be offered it.
    test.each([
      ['a reader', 'read', false, ACL_Operation.READ],
      ['a writer', 'write', false, ACL_Operation.WRITE],
      ['a reader', 'write', true, ACL_Operation.READ],
    ] as const)(
      '11c. %s, for a component that needs %s access, is offered the grant: %s',
      async (_user, topicAccess, offered, operation) => {
        const user = userEvent.setup();
        const listUsersMock = rs
          .fn()
          .mockReturnValue(
            create(ListUsersResponseSchema, { users: [create(ListUsersResponse_UserSchema, { name: 'perms-user' })] })
          );
        const listACLsMock = rs.fn().mockReturnValue(
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
                    operation,
                    permissionType: ACL_PermissionType.ALLOW,
                  }),
                ],
              }),
            ],
          })
        );
        const { transport, createACLMock } = buildTransport({ listUsersMock, listACLsMock });
        let capturedResult: unknown;

        renderWithFileRoutes(
          <TestHarness
            defaultUsername="perms-user"
            onResult={(r: unknown) => {
              capturedResult = r;
            }}
            selectionMode="existing"
            topicAccess={topicAccess}
            topicName="my-topic"
          />,
          { transport }
        );

        const checkbox = { name: 'Grant this user full access to my-topic' };
        if (offered) {
          expect(await screen.findByRole('checkbox', checkbox)).toBeChecked();
        } else {
          expect(await screen.findByText(HAS_TOPIC_ACCESS)).toBeInTheDocument();
          expect(screen.queryByRole('checkbox', checkbox)).toBeNull();
        }
        await user.click(screen.getByTestId('submit'));
        await waitFor(() => expect(capturedResult).toMatchObject({ success: true }));
        expect(topicGrants(createACLMock)).toHaveLength(offered ? 1 : 0);
      }
    );
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
