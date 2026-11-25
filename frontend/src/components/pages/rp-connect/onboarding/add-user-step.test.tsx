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
import { createRouterTransport, type MethodImpl, type Transport } from '@connectrpc/connect';
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
import { type ReactNode, type Ref, useImperativeHandle, useRef } from 'react';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';
import { asyncEvent } from 'utils/async-event';
import { reportActionError } from 'utils/toast.utils';

// ── Component import (after mocks) ────────────────────────────────────────────
import { AddUserStep } from './add-user-step';
import type { UserStepRef, UserStepSubmissionResult } from '../types/wizard';

// ── Mocks ──────────────────────────────────────────────────────────────────────

rs.mock('config', () => ({ addBearerTokenInterceptor: rs.fn((next: unknown) => next) }));

rs.mock('runtime-config', () => ({
  config: {
    jwt: 'test-jwt-token',
    controlplaneUrl: 'http://localhost:9090',
    clusterId: 'test-cluster',
    isServerless: false,
  },
  isFeatureFlagEnabled: rs.fn(() => false),
}));

// Mock generatePassword to return deterministic value
rs.mock('utils/password', () => ({
  generatePassword: rs.fn(() => 'mock-generated-password-12345'),
}));

// Mock ServiceAccountSelector with functional ref (React 19 hands a function component its `ref` as a prop)
function MockServiceAccountSelector({ ref }: { ref?: Ref<unknown> }) {
  useImperativeHandle(ref, () => ({
    createServiceAccount: rs.fn().mockResolvedValue({
      serviceAccountId: 'sa-123',
      secretName: 'sa-secret',
    }),
    isPending: false,
  }));
  return <div data-testid="service-account-selector" />;
}

rs.mock('components/ui/service-account/service-account-selector', () => ({
  ServiceAccountSelector: MockServiceAccountSelector,
}));

// Mock TanStack Router Link
function MockLink({ children }: { children: ReactNode }) {
  return <a href="/">{children}</a>;
}

rs.mock('@tanstack/react-router', () => {
  const actual = rs.requireActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');
  return {
    ...actual,
    Link: MockLink,
  };
});

// Polyfills
global.ResizeObserver = class ResizeObserver {
  observe = () => undefined;
  unobserve = () => undefined;
  disconnect = () => undefined;
};
Element.prototype.scrollIntoView = rs.fn();

// ── Helpers ────────────────────────────────────────────────────────────────────

function TestHarness({
  onResult,
  ...props
}: {
  onResult: (result: UserStepSubmissionResult) => void;
  [key: string]: unknown;
}) {
  const ref = useRef<UserStepRef>(null);
  return (
    <>
      <AddUserStep hideTitle ref={ref} selectionMode="new" {...props} />
      <button
        data-testid="submit"
        onClick={asyncEvent(async () => {
          const step = ref.current;
          if (step === null) {
            throw new Error('Expected the mounted user step');
          }
          const result = await step.triggerSubmit();
          onResult(result);
        }, reportActionError)}
        type="button"
      >
        Submit
      </button>
    </>
  );
}

/** Build transport with common RPC mocks */
function buildTransport(overrides?: {
  listUsersMock?: ReturnType<typeof rs.fn<MethodImpl<typeof listUsers>>>;
  createUserMock?: ReturnType<typeof rs.fn<MethodImpl<typeof createUser>>>;
  listACLsMock?: ReturnType<typeof rs.fn<MethodImpl<typeof listACLs>>>;
  createACLMock?: ReturnType<typeof rs.fn<MethodImpl<typeof createACL>>>;
  createSecretMock?: ReturnType<typeof rs.fn<MethodImpl<typeof createSecret>>>;
  listSecretsMock?: ReturnType<typeof rs.fn<MethodImpl<typeof listSecrets>>>;
}) {
  const listUsersMock =
    overrides?.listUsersMock ??
    rs.fn<MethodImpl<typeof listUsers>>().mockReturnValue(
      create(ListUsersResponseSchema, {
        users: [],
        nextPageToken: '',
      })
    );

  const createUserMock =
    overrides?.createUserMock ??
    rs.fn<MethodImpl<typeof createUser>>().mockReturnValue(create(CreateUserResponseSchema, {}));

  const listACLsMock =
    overrides?.listACLsMock ??
    rs.fn<MethodImpl<typeof listACLs>>().mockReturnValue(create(ListACLsResponseSchema, { resources: [] }));

  const createACLMock = overrides?.createACLMock ?? rs.fn<MethodImpl<typeof createACL>>().mockReturnValue({});

  const createSecretMock =
    overrides?.createSecretMock ??
    rs.fn<MethodImpl<typeof createSecret>>().mockReturnValue(create(CreateSecretResponseSchemaConsole, {}));

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

/** Renders the harness and records what `triggerSubmit` resolves to. */
function renderCapturingResult(props: Record<string, unknown>, transport: Transport) {
  const captured: { result?: UserStepSubmissionResult } = {};
  renderWithFileRoutes(
    <TestHarness
      onResult={(r: UserStepSubmissionResult) => {
        captured.result = r;
      }}
      {...props}
    />,
    { transport }
  );
  return captured;
}

/** listUsers returning exactly these users. */
function listUsersReturning(...names: string[]) {
  return rs.fn().mockReturnValue(
    create(ListUsersResponseSchema, {
      users: names.map((name) => create(ListUsersResponse_UserSchema, { name })),
      nextPageToken: '',
    })
  );
}

/** listACLs returning one topic resource whose ACLs allow `principal` each of `operations`. */
function topicAclsAllowing({
  principal,
  operations,
  resourceName = 'my-topic',
  resourcePatternType = ACL_ResourcePatternType.LITERAL,
}: {
  principal: string;
  operations: ACL_Operation[];
  resourceName?: string;
  resourcePatternType?: ACL_ResourcePatternType;
}) {
  return rs.fn().mockReturnValue(
    create(ListACLsResponseSchema, {
      resources: [
        create(ListACLsResponse_ResourceSchema, {
          resourceType: ACL_ResourceType.TOPIC,
          resourceName,
          resourcePatternType,
          acls: operations.map((operation) =>
            create(ListACLsResponse_PolicySchema, {
              principal,
              host: '*',
              operation,
              permissionType: ACL_PermissionType.ALLOW,
            })
          ),
        }),
      ],
    })
  );
}

/** Types `username` into the new-user field and submits the step. */
async function submitWithUsername(user: ReturnType<typeof userEvent.setup>, username: string) {
  const usernameInput = await screen.findByPlaceholderText('Enter a username');
  await user.type(usernameInput, username);

  await user.click(screen.getByTestId('submit'));
}

function RefCaptureHarness({ onCapture }: { onCapture: (ref: UserStepRef | null) => void }) {
  const ref = useRef<UserStepRef>(null);
  return (
    <>
      <AddUserStep hideTitle ref={ref} selectionMode="new" />
      <button data-testid="capture-ref" onClick={() => onCapture(ref.current)} type="button">
        Capture
      </button>
    </>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

const ALREADY_EXISTS = /already exists/;
const HAS_TOPIC_ACCESS = /has required permissions/i;

/** Asserts the grant checkbox is offered (and ticked), or that the user's existing access shows instead. */
async function expectTopicGrantOffered(offered: boolean) {
  const checkbox = { name: 'Grant this user full access to my-topic' };
  if (offered) {
    expect(await screen.findByRole('checkbox', checkbox)).toBeChecked();
  } else {
    expect(await screen.findByText(HAS_TOPIC_ACCESS)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', checkbox)).toBeNull();
  }
}

describe('the AddUserStep', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  // ── SASL path ──────────────────────────────────────────────────────────────

  describe('the SASL path', () => {
    test('1. new SASL user calls createUser RPC', async () => {
      const user = userEvent.setup();
      const { transport, createUserMock } = buildTransport();
      let capturedResult: UserStepSubmissionResult | undefined;

      renderWithFileRoutes(
        <TestHarness
          onResult={(r: UserStepSubmissionResult) => {
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
        expect(capturedResult?.success).toBe(true);
      });
    });

    test('2. triggerSubmit returns username and saslMechanism', async () => {
      const user = userEvent.setup();
      const { transport } = buildTransport();
      let capturedResult: UserStepSubmissionResult | undefined;

      renderWithFileRoutes(
        <TestHarness
          onResult={(r: UserStepSubmissionResult) => {
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
        expect(capturedResult).toMatchObject({
          success: true,
          data: { username: 'my-user', saslMechanism: 'SCRAM-SHA-256' },
        });
      });
    });

    test('3. empty username rejected — triggerSubmit returns success: false', async () => {
      const user = userEvent.setup();
      const { transport } = buildTransport();
      let capturedResult: UserStepSubmissionResult | undefined;

      renderWithFileRoutes(
        <TestHarness
          onResult={(r: UserStepSubmissionResult) => {
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
        expect(capturedResult?.success).toBe(false);
      });
    });

    test('4. existing user skips createUser call', async () => {
      const user = userEvent.setup();
      const { transport, createUserMock, listUsersMock } = buildTransport({
        listUsersMock: listUsersReturning('existing-user'),
      });

      // Use selectionMode="new" so the component renders an Input instead of Combobox.
      // Type a username that matches an existing user.
      // The component detects the existing user and skips createUser.
      const captured = renderCapturingResult({ selectionMode: 'new' }, transport);

      // Wait for the user list to load
      await waitFor(() => {
        expect(listUsersMock.mock.calls[0]?.[0]).toMatchObject({ pageSize: 25, pageToken: '' });
      });

      // Type an existing username into the input
      await submitWithUsername(user, 'existing-user');

      await waitFor(() => {
        expect(captured.result).toBeDefined();
        expect(captured.result?.success).toBe(true);
      });

      // createUser should NOT have been called for existing user
      // When selectionMode="new" but username matches existing, existingUserSelected is truthy
      // and the mutation treats it as existing user (skips createUser)
      expect(createUserMock).not.toHaveBeenCalled();
    });

    test('5. consumer group fields shown when showConsumerGroupFields=true', async () => {
      const { transport } = buildTransport();

      renderWithFileRoutes(
        <TestHarness onResult={() => undefined} selectionMode="new" showConsumerGroupFields={true} />,
        {
          transport,
        }
      );

      const consumerGroupInput = await screen.findByPlaceholderText('Enter a consumer group name');
      expect(consumerGroupInput).toBeInTheDocument();
    });

    test('6. consumer group included in submission result', async () => {
      const user = userEvent.setup();
      const { transport, createUserMock } = buildTransport();
      const captured = renderCapturingResult({ selectionMode: 'new', showConsumerGroupFields: true }, transport);

      const usernameInput = await screen.findByPlaceholderText('Enter a username');
      await user.type(usernameInput, 'cg-user');

      const cgInput = screen.getByPlaceholderText('Enter a consumer group name');
      await user.type(cgInput, 'my-consumer-group');

      await user.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(createUserMock).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(captured.result).toBeDefined();
        expect(captured.result).toMatchObject({ success: true, data: { consumerGroup: 'my-consumer-group' } });
      });
    });
  });

  // An input connecting as this user reads through its consumer group, so starting from the
  // pipeline's group has to end in that group being granted.
  describe('consumer group from the pipeline', () => {
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

  describe('service Account path', () => {
    test('7. SA tab switches auth mode', async () => {
      const user = userEvent.setup();
      const { transport } = buildTransport();

      renderWithFileRoutes(<TestHarness onResult={() => undefined} selectionMode="new" />, { transport });

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

      renderWithFileRoutes(<TestHarness onResult={() => undefined} pipelineName="my-pipe" selectionMode="new" />, {
        transport,
      });

      // Switch to Service Account tab
      const saTab = await screen.findByText('Service account');
      await user.click(saTab);

      await waitFor(() => {
        const nameInput = screen.getByLabelText<HTMLInputElement>('Service account name');
        // The generateServiceAccountName with pipelineName='my-pipe' should contain 'my-pipe'
        expect(nameInput.value).toContain('my-pipe');
      });
    });

    test('9. SA triggerSubmit returns SA data', async () => {
      const user = userEvent.setup();
      const { transport } = buildTransport();
      let capturedResult: UserStepSubmissionResult | undefined;

      renderWithFileRoutes(
        <TestHarness
          onResult={(r: UserStepSubmissionResult) => {
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
        expect(capturedResult).toMatchObject({
          success: true,
          data: { authMethod: 'service-account', serviceAccountId: 'sa-123' },
        });
      });
    });

    // Connect logs every service-account component in as the pipeline's one account, so a second one
    // would replace it for all of them and orphan the first.
    test('keeps the pipeline service account instead of creating another', async () => {
      const user = userEvent.setup();
      const { transport } = buildTransport();
      let capturedResult: UserStepSubmissionResult | undefined;

      renderWithFileRoutes(
        <TestHarness
          hasServiceAccount
          onResult={(r: UserStepSubmissionResult) => {
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
        expect(capturedResult).toStrictEqual({ success: true, data: { authMethod: 'service-account', existing: true } })
      );
    });
  });

  // A component logs in as the user it's given, so an existing one has to work as configured.
  describe('existing user', () => {
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
      let capturedResult: UserStepSubmissionResult | undefined;

      renderWithFileRoutes(
        <TestHarness
          onResult={(r: UserStepSubmissionResult) => {
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

  describe('permissions', () => {
    const userWithoutAccess = () =>
      rs
        .fn()
        .mockReturnValue(
          create(ListUsersResponseSchema, { users: [create(ListUsersResponse_UserSchema, { name: 'no-perms-user' })] })
        );
    const topicGrants = (createACLMock: ReturnType<typeof rs.fn<MethodImpl<typeof createACL>>>) =>
      createACLMock.mock.calls.filter(([request]) => request.resourceName === 'my-topic');

    // A reused user has to end up able to use the topic, as a new one does.
    test.each(['existing', 'new'] as const)(
      '10. grants an existing user without access the topic (%s tab)',
      async (selectionMode) => {
        const user = userEvent.setup();
        const { transport, listACLsMock, createACLMock, createUserMock, createSecretMock } = buildTransport({
          listUsersMock: userWithoutAccess(),
        });
        const captured = renderCapturingResult(
          { defaultUsername: 'no-perms-user', selectionMode, topicName: 'my-topic' },
          transport
        );

        // The topic's ACLs are only fetched once the name resolves to an existing user.
        await waitFor(() =>
          expect(listACLsMock.mock.calls[0]?.[0]).toMatchObject({
            filter: {
              resourceType: ACL_ResourceType.TOPIC,
              resourceName: 'my-topic',
              resourcePatternType: ACL_ResourcePatternType.MATCH,
            },
          })
        );
        expect(await screen.findByRole('checkbox', { name: 'Grant this user full access to my-topic' })).toBeChecked();
        await user.click(screen.getByTestId('submit'));

        await waitFor(() => expect(captured.result).toMatchObject({ success: true }));
        expect(topicGrants(createACLMock)).toStrictEqual([
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
      let capturedResult: UserStepSubmissionResult | undefined;

      renderWithFileRoutes(
        <TestHarness
          defaultUsername="no-perms-user"
          onResult={(r: UserStepSubmissionResult) => {
            capturedResult = r;
          }}
          selectionMode="existing"
          topicName="my-topic"
        />,
        { transport }
      );

      await waitFor(() =>
        expect(listACLsMock.mock.calls[0]?.[0]).toMatchObject({
          filter: {
            resourceType: ACL_ResourceType.TOPIC,
            resourceName: 'my-topic',
            resourcePatternType: ACL_ResourcePatternType.MATCH,
          },
        })
      );
      await user.click(await screen.findByRole('checkbox', { name: 'Grant this user full access to my-topic' }));
      expect(await screen.findByText('User will not be able to read from topic')).toBeInTheDocument();
      await user.click(screen.getByTestId('submit'));

      await waitFor(() => expect(capturedResult).toMatchObject({ success: true }));
      expect(topicGrants(createACLMock)).toStrictEqual([]);
    });

    test('11. has permissions alert when user has ACLs', async () => {
      const user = userEvent.setup();
      // Return ACLs with READ and WRITE permissions
      const { transport, createACLMock, listUsersMock } = buildTransport({
        listUsersMock: listUsersReturning('perms-user'),
        listACLsMock: topicAclsAllowing({
          principal: 'User:perms-user',
          operations: [ACL_Operation.READ, ACL_Operation.WRITE],
        }),
      });

      // Use defaultUsername to pre-fill the existing user selection
      const captured = renderCapturingResult(
        { defaultUsername: 'perms-user', selectionMode: 'existing', topicName: 'my-topic' },
        transport
      );

      // Wait for user list to load
      await waitFor(() => {
        expect(listUsersMock.mock.calls[0]?.[0]).toMatchObject({ pageSize: 25, pageToken: '' });
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
      await waitFor(() => expect(captured.result).toMatchObject({ success: true }));
      expect(topicGrants(createACLMock)).toStrictEqual([]);
    });
    test.each([
      ['a prefixed', 'my-', ACL_ResourcePatternType.PREFIXED],
      ['a wildcard', '*', ACL_ResourcePatternType.LITERAL],
    ])('11b. counts %s ACL that covers the topic as access', async (_case, resourceName, resourcePatternType) => {
      const { transport, listACLsMock } = buildTransport({
        listUsersMock: listUsersReturning('perms-user'),
        listACLsMock: topicAclsAllowing({
          principal: 'User:perms-user',
          operations: [ACL_Operation.ALL],
          resourceName,
          resourcePatternType,
        }),
      });

      renderWithFileRoutes(
        <TestHarness defaultUsername="perms-user" onResult={rs.fn()} selectionMode="existing" topicName="my-topic" />,
        { transport }
      );

      expect(await screen.findByText(HAS_TOPIC_ACCESS)).toBeInTheDocument();
      expect(screen.queryByRole('checkbox', { name: 'Grant this user full access to my-topic' })).toBeNull();
      expect(
        listACLsMock.mock.calls.some(
          ([request, context]) =>
            request.filter?.resourcePatternType === ACL_ResourcePatternType.MATCH &&
            context !== null &&
            context !== undefined
        )
      ).toBe(true);
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
        const { transport, createACLMock } = buildTransport({
          listUsersMock: listUsersReturning('perms-user'),
          listACLsMock: topicAclsAllowing({ principal: 'User:perms-user', operations: [operation] }),
        });
        const captured = renderCapturingResult(
          { defaultUsername: 'perms-user', selectionMode: 'existing', topicAccess, topicName: 'my-topic' },
          transport
        );

        await expectTopicGrantOffered(offered);
        await user.click(screen.getByTestId('submit'));
        await waitFor(() => expect(captured.result).toMatchObject({ success: true }));
        expect(topicGrants(createACLMock)).toHaveLength(offered ? 1 : 0);
      }
    );
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    test('12. isPending accessible via ref', async () => {
      const user = userEvent.setup();
      const { transport } = buildTransport();
      const captured: { current: UserStepRef | null } = { current: null };

      renderWithFileRoutes(
        <RefCaptureHarness
          onCapture={(ref) => {
            captured.current = ref;
          }}
        />,
        { transport }
      );

      // Wait for render
      await screen.findByPlaceholderText('Enter a username');

      await user.click(screen.getByTestId('capture-ref'));

      expect(captured.current).toMatchObject({ isPending: false });
      expect(typeof captured.current?.triggerSubmit).toBe('function');
    });
  });
});
