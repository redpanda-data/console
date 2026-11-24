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
  type CreateServiceAccountRequest,
  CreateServiceAccountRequestSchema,
  CreateServiceAccountResponseSchema,
  ServiceAccountService,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/iam/v1/service_account_pb';
import { create, fromJsonString, toJson } from '@bufbuild/protobuf';
import { createRouterTransport, type Transport } from '@connectrpc/connect';
import { afterAll, afterEach, beforeAll, describe, expect, test } from '@rstest/core';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { config } from 'config';
import { HttpResponse, http } from 'msw';
import { HttpNetworkFrame } from 'msw/experimental';
import { setupServer } from 'msw/node';
import {
  type CreateSecretRequest as CreateSecretRequestConsole,
  type ListSecretsResponse as ListSecretsResponseConsole,
  ListSecretsResponseSchema as ListSecretsResponseSchemaConsole,
} from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { createSecret, listSecrets } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  type CreateACLRequest,
  type ListACLsRequest,
  type ListACLsResponse,
  ListACLsResponse_PolicySchema,
  ListACLsResponse_ResourceSchema,
  ListACLsResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { createACL, listACLs } from 'protogen/redpanda/api/dataplane/v1/acl-ACLService_connectquery';
import { ListSecretsResponseSchema, SecretSchema } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import {
  type CreateUserRequest,
  type ListUsersRequest,
  type ListUsersResponse,
  ListUsersResponse_UserSchema,
  ListUsersResponseSchema,
  SASLMechanism,
} from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { createUser, listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import { type ComponentProps, useRef } from 'react';
import { cleanup, renderWithFileRoutes, screen, waitFor } from 'test-utils';

import { AddUserStep } from './add-user-step';
import type { UserStepRef, UserStepSubmissionResult } from '../types/wizard';

const CONTROLPLANE_ORIGIN = 'https://onboarding.example.test';
const CLUSTER_ID = 'test-cluster';
const SERVICE_ACCOUNT_ID = 'sa-123';
const PIPELINE_NAME = 'my-pipe';
const PIPELINE_ACCOUNT = /my-pipe/u;
const serviceAccountRequests: CreateServiceAccountRequest[] = [];
const originalControlplaneUrl = config.controlplaneUrl;
const originalClusterId = config.clusterId;
const guardedFetch = globalThis.fetch;
const createAccountUrl = `${CONTROLPLANE_ORIGIN}/${ServiceAccountService.typeName}/${ServiceAccountService.method.createServiceAccount.name}`;
const server = setupServer(
  http.post(createAccountUrl, async ({ request }) => {
    serviceAccountRequests.push(fromJsonString(CreateServiceAccountRequestSchema, await request.text()));
    return HttpResponse.json(
      toJson(
        CreateServiceAccountResponseSchema,
        create(CreateServiceAccountResponseSchema, {
          serviceAccount: {
            id: SERVICE_ACCOUNT_ID,
            auth0ClientCredentials: { clientId: 'fixture-client', clientSecret: 'fixture-secret' },
          },
        })
      )
    );
  })
);

beforeAll(() => {
  server.listen({
    async onUnhandledFrame({ frame }) {
      if (frame instanceof HttpNetworkFrame) {
        await guardedFetch(frame.data.request);
      }
      throw new Error('Unexpected network frame in the user step');
    },
  });
  config.controlplaneUrl = CONTROLPLANE_ORIGIN;
  config.clusterId = CLUSTER_ID;
});

afterEach(() => {
  cleanup();
  serviceAccountRequests.length = 0;
  server.resetHandlers();
});

afterAll(() => {
  config.controlplaneUrl = originalControlplaneUrl;
  config.clusterId = originalClusterId;
  server.close();
});

type StepProps = Partial<Omit<ComponentProps<typeof AddUserStep>, 'ref'>>;

function TestHarness({ onResult, ...props }: { onResult?: (result: UserStepSubmissionResult) => void } & StepProps) {
  const ref = useRef<UserStepRef>(null);
  return (
    <>
      <AddUserStep hideTitle ref={ref} selectionMode="new" {...props} />
      <button
        data-testid="submit"
        onClick={async () => {
          if (ref.current) {
            const result = await ref.current.triggerSubmit();
            onResult?.(result);
          }
        }}
        type="button"
      >
        Submit
      </button>
    </>
  );
}

type OnboardingReplies = {
  users?: ListUsersResponse;
  acls?: ListACLsResponse;
  secrets?: ListSecretsResponseConsole;
};

function buildTransport({
  users = create(ListUsersResponseSchema),
  acls = create(ListACLsResponseSchema),
  secrets = create(ListSecretsResponseSchemaConsole),
}: OnboardingReplies = {}) {
  const userListRequests: ListUsersRequest[] = [];
  const userCreates: CreateUserRequest[] = [];
  const aclListRequests: ListACLsRequest[] = [];
  const aclCreates: CreateACLRequest[] = [];
  const secretCreates: CreateSecretRequestConsole[] = [];

  const transport = createRouterTransport(({ rpc }) => {
    rpc(listUsers, (request) => {
      userListRequests.push(request);
      return users;
    });
    rpc(createUser, (request) => {
      userCreates.push(request);
      return {};
    });
    rpc(listACLs, (request) => {
      aclListRequests.push(request);
      return acls;
    });
    rpc(createACL, (request) => {
      aclCreates.push(request);
      return {};
    });
    rpc(createSecret, (request) => {
      secretCreates.push(request);
      return {};
    });
    rpc(listSecrets, () => secrets);
  });

  return { transport, userListRequests, userCreates, aclListRequests, aclCreates, secretCreates };
}

function renderCapturingResult(props: StepProps, transport: Transport) {
  const captured: { result?: UserStepSubmissionResult } = {};
  renderWithFileRoutes(
    <TestHarness
      onResult={(r) => {
        captured.result = r;
      }}
      {...props}
    />,
    { transport }
  );
  return captured;
}

function listUsersReturning(...names: string[]) {
  return create(ListUsersResponseSchema, {
    users: names.map((name) => create(ListUsersResponse_UserSchema, { name })),
  });
}

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
  return create(ListACLsResponseSchema, {
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
  });
}

async function submitWithUsername(user: ReturnType<typeof userEvent.setup>, username: string) {
  const usernameInput = await screen.findByPlaceholderText('Enter a username');
  await user.type(usernameInput, username);

  await user.click(screen.getByTestId('submit'));
}

const ALREADY_EXISTS = /already exists/u;
const HAS_TOPIC_ACCESS = /has required permissions/iu;

async function expectTopicGrantOffered(offered: boolean) {
  const checkbox = { name: 'Grant this user full access to my-topic' };
  if (offered) {
    expect(await screen.findByRole('checkbox', checkbox)).toBeChecked();
  } else {
    expect(await screen.findByText(HAS_TOPIC_ACCESS)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', checkbox)).toBeNull();
  }
}

function expectServiceAccountSecret(requests: CreateSecretRequestConsole[]) {
  expect(requests).toHaveLength(1);
  expect(requests[0]?.request?.labels).toMatchObject({ service_account_id: SERVICE_ACCOUNT_ID });
  expect(JSON.parse(new TextDecoder().decode(requests[0]?.request?.secretData))).toEqual({
    client_id: 'fixture-client',
    client_secret: 'fixture-secret',
  });
}

describe('the AddUserStep', () => {
  describe('the SASL path', () => {
    test('creates a SASL user and returns the same name and mechanism to the wizard', async () => {
      const user = userEvent.setup();
      const { transport, userCreates } = buildTransport();
      const captured = renderCapturingResult({ selectionMode: 'new' }, transport);
      fireEvent.input(await screen.findByPlaceholderText('Enter a username'), { target: { value: 'my-user' } });

      await user.click(screen.getByTestId('submit'));

      await waitFor(() =>
        expect(captured.result).toMatchObject({
          success: true,
          data: { username: 'my-user', saslMechanism: 'SCRAM-SHA-256' },
        })
      );
      expect(userCreates).toMatchObject([
        { user: { name: 'my-user', mechanism: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256 } },
      ]);
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

      await screen.findByPlaceholderText('Enter a username');

      await user.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(capturedResult).toBeDefined();
        expect((capturedResult as { success: boolean }).success).toBe(false);
      });
    });

    test('4. existing user skips createUser call', async () => {
      const user = userEvent.setup();
      const { transport, userCreates, userListRequests } = buildTransport({
        users: listUsersReturning('existing-user'),
      });

      const captured = renderCapturingResult({ selectionMode: 'new' }, transport);

      await waitFor(() => {
        expect(userListRequests.length).toBeGreaterThan(0);
      });

      await submitWithUsername(user, 'existing-user');

      await waitFor(() => {
        expect(captured.result).toBeDefined();
        expect((captured.result as { success: boolean }).success).toBe(true);
      });

      expect(userCreates).toHaveLength(0);
    });

    test('6. consumer group included in submission result', async () => {
      const user = userEvent.setup();
      const { transport, userCreates } = buildTransport();
      const captured = renderCapturingResult({ selectionMode: 'new', showConsumerGroupFields: true }, transport);

      const usernameInput = await screen.findByPlaceholderText('Enter a username');
      await user.type(usernameInput, 'cg-user');

      const cgInput = screen.getByPlaceholderText('Enter a consumer group name');
      await user.type(cgInput, 'my-consumer-group');

      await user.click(screen.getByTestId('submit'));

      await waitFor(() => {
        expect(userCreates).toHaveLength(1);
      });

      await waitFor(() => {
        expect(captured.result).toBeDefined();
        const result = captured.result as { success: boolean; data?: { consumerGroup: string } };
        expect(result.success).toBe(true);
        expect(result.data?.consumerGroup).toBe('my-consumer-group');
      });
    });
  });

  describe('consumer group from the pipeline', () => {
    test('grants access to the existing consumer group the pipeline reads through', async () => {
      const user = userEvent.setup();
      const { transport, aclCreates } = buildTransport();

      renderWithFileRoutes(
        <TestHarness
          defaultConsumerGroup="orders-readers"
          selectionMode="new"
          showConsumerGroupFields={true}
          topicName="orders"
        />,
        { transport }
      );

      expect(await screen.findByPlaceholderText('Enter a consumer group name')).toHaveValue('orders-readers');
      await user.type(screen.getByPlaceholderText('Enter a username'), 'orders-reader');
      await user.click(screen.getByTestId('submit'));

      await waitFor(() => expect(aclCreates.some((request) => request.resourceName === 'orders-readers')).toBe(true));
    });
  });

  describe('service accounts', () => {
    test('creates the named account and stores its credentials for the pipeline', async () => {
      const user = userEvent.setup();
      const { transport, secretCreates } = buildTransport();
      const captured = renderCapturingResult({ pipelineName: PIPELINE_NAME, selectionMode: 'new' }, transport);

      await user.click(await screen.findByText('Service account'));
      expect(await screen.findByDisplayValue(PIPELINE_ACCOUNT)).toBeVisible();
      await user.click(screen.getByTestId('submit'));

      await waitFor(() =>
        expect(captured.result).toMatchObject({
          success: true,
          data: { authMethod: 'service-account', serviceAccountId: SERVICE_ACCOUNT_ID },
        })
      );
      expect(serviceAccountRequests).toMatchObject([
        {
          serviceAccount: {
            name: expect.stringContaining(PIPELINE_NAME),
            roleBindings: [{ scope: { resourceId: CLUSTER_ID }, roleName: 'Writer' }],
          },
        },
      ]);
      expectServiceAccountSecret(secretCreates);
    });

    test('reuses the pipeline-wide service account without creating a second account', async () => {
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
      expect(screen.queryByLabelText('Service account name')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('submit'));

      await waitFor(() =>
        expect(capturedResult).toEqual({ success: true, data: { authMethod: 'service-account', existing: true } })
      );
      expect(serviceAccountRequests).toHaveLength(0);
    });
  });

  describe('existing user', () => {
    const existingUser = () =>
      create(ListUsersResponseSchema, {
        users: [{ name: 'existing-user', mechanism: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512 }],
      });
    const storedSecrets = (...ids: string[]) =>
      create(ListSecretsResponseSchemaConsole, {
        response: create(ListSecretsResponseSchema, { secrets: ids.map((id) => create(SecretSchema, { id })) }),
      });

    test('logs in with the mechanism the user was created with', async () => {
      const user = userEvent.setup();
      const { transport } = buildTransport({ users: existingUser() });
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

    test.each([
      ['none', [], 'KAFKA_USER_EXISTING_USER and KAFKA_PASSWORD_EXISTING_USER secrets, which'],
      ['only the username', ['KAFKA_USER_EXISTING_USER'], 'with the KAFKA_PASSWORD_EXISTING_USER secret, which'],
    ])('names the credential secrets it lacks when %s are stored', async (_case, ids, named) => {
      const user = userEvent.setup();
      const { transport } = buildTransport({ users: existingUser(), secrets: storedSecrets(...ids) });

      renderWithFileRoutes(<TestHarness selectionMode="new" />, { transport });

      await user.type(await screen.findByPlaceholderText('Enter a username'), 'existing-user');
      expect(await screen.findByText('No stored credentials for this user')).toBeInTheDocument();
      expect(screen.getByText(new RegExp(named, 'u'))).toBeInTheDocument();
    });
  });

  describe('permissions', () => {
    const userWithoutAccess = () => listUsersReturning('no-perms-user');
    const topicGrants = (requests: CreateACLRequest[]) =>
      requests.filter((request) => request.resourceName === 'my-topic');

    test.each(['existing', 'new'] as const)(
      '10. grants an existing user without access the topic (%s tab)',
      async (selectionMode) => {
        const user = userEvent.setup();
        const { transport, aclListRequests, aclCreates, userCreates, secretCreates } = buildTransport({
          users: userWithoutAccess(),
        });
        const captured = renderCapturingResult(
          { defaultUsername: 'no-perms-user', selectionMode, topicName: 'my-topic' },
          transport
        );

        await waitFor(() => expect(aclListRequests.length).toBeGreaterThan(0));
        expect(await screen.findByRole('checkbox', { name: 'Grant this user full access to my-topic' })).toBeChecked();
        await user.click(screen.getByTestId('submit'));

        await waitFor(() => expect(captured.result).toMatchObject({ success: true }));
        expect(topicGrants(aclCreates)).toMatchObject([
          { principal: 'User:no-perms-user', operation: ACL_Operation.ALL },
        ]);
        expect(userCreates).toHaveLength(0);
        expect(secretCreates).toHaveLength(0);
      }
    );

    test("10b. leaves an existing user's access alone when the grant is unticked", async () => {
      const user = userEvent.setup();
      const { transport, aclListRequests, aclCreates } = buildTransport({ users: userWithoutAccess() });
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

      await waitFor(() => expect(aclListRequests.length).toBeGreaterThan(0));
      await user.click(await screen.findByRole('checkbox', { name: 'Grant this user full access to my-topic' }));
      expect(await screen.findByText('User will not be able to read from topic')).toBeInTheDocument();
      await user.click(screen.getByTestId('submit'));

      await waitFor(() => expect(capturedResult).toMatchObject({ success: true }));
      expect(topicGrants(aclCreates)).toEqual([]);
    });

    test('11. has permissions alert when user has ACLs', async () => {
      const user = userEvent.setup();
      const { transport, aclCreates, userListRequests } = buildTransport({
        users: listUsersReturning('perms-user'),
        acls: topicAclsAllowing({
          principal: 'User:perms-user',
          operations: [ACL_Operation.READ, ACL_Operation.WRITE],
        }),
      });

      const captured = renderCapturingResult(
        { defaultUsername: 'perms-user', selectionMode: 'existing', topicName: 'my-topic' },
        transport
      );

      await waitFor(() => {
        expect(userListRequests.length).toBeGreaterThan(0);
      });

      await waitFor(
        () => {
          expect(screen.getByText(HAS_TOPIC_ACCESS)).toBeInTheDocument();
        },
        { timeout: 5000 }
      );

      expect(screen.queryByRole('checkbox', { name: 'Grant this user full access to my-topic' })).toBeNull();
      await user.click(screen.getByTestId('submit'));
      await waitFor(() => expect(captured.result).toMatchObject({ success: true }));
      expect(topicGrants(aclCreates)).toEqual([]);
    });
    test.each([
      ['a prefixed', 'my-', ACL_ResourcePatternType.PREFIXED],
      ['a wildcard', '*', ACL_ResourcePatternType.LITERAL],
    ])('11b. counts %s ACL that covers the topic as access', async (_case, resourceName, resourcePatternType) => {
      const { transport, aclListRequests } = buildTransport({
        users: listUsersReturning('perms-user'),
        acls: topicAclsAllowing({
          principal: 'User:perms-user',
          operations: [ACL_Operation.ALL],
          resourceName,
          resourcePatternType,
        }),
      });

      renderWithFileRoutes(<TestHarness defaultUsername="perms-user" selectionMode="existing" topicName="my-topic" />, {
        transport,
      });

      expect(await screen.findByText(HAS_TOPIC_ACCESS)).toBeInTheDocument();
      expect(screen.queryByRole('checkbox', { name: 'Grant this user full access to my-topic' })).toBeNull();
      expect(aclListRequests).toContainEqual(
        expect.objectContaining({
          filter: expect.objectContaining({ resourcePatternType: ACL_ResourcePatternType.MATCH }),
        })
      );
    });

    test.each([
      ['a reader', 'read', false, ACL_Operation.READ],
      ['a writer', 'write', false, ACL_Operation.WRITE],
      ['a reader', 'write', true, ACL_Operation.READ],
    ] as const)(
      'offers a broader grant to %s needing %s access only when required: %s',
      async (_user, topicAccess, offered, operation) => {
        const user = userEvent.setup();
        const { transport, aclCreates } = buildTransport({
          users: listUsersReturning('perms-user'),
          acls: topicAclsAllowing({ principal: 'User:perms-user', operations: [operation] }),
        });
        const captured = renderCapturingResult(
          { defaultUsername: 'perms-user', selectionMode: 'existing', topicAccess, topicName: 'my-topic' },
          transport
        );

        await expectTopicGrantOffered(offered);
        await user.click(screen.getByTestId('submit'));
        await waitFor(() => expect(captured.result).toMatchObject({ success: true }));
        expect(topicGrants(aclCreates)).toHaveLength(offered ? 1 : 0);
      }
    );
  });
});
