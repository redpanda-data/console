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

import { create, type MessageShape } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import { beforeEach, describe, expect, onTestFinished, test } from '@rstest/core';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { config } from 'config';
import { updateShadowLink } from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';
import { type ShadowLink, ShadowLinkSchema } from 'protogen/redpanda/api/dataplane/v1/shadowlink_pb';
import { getShadowLink } from 'protogen/redpanda/api/dataplane/v1/shadowlink-ShadowLinkService_connectquery';
import {
  ACLFilterSchema,
  AuthenticationConfigurationSchema,
  FilterType,
  NameFilterSchema,
  PatternType,
  SchemaRegistrySyncOptionsSchema,
  ScramConfigSchema,
  ScramMechanism,
  SecuritySettingsSyncOptionsSchema,
  ShadowLinkConfigurationsSchema,
  ShadowLinkState,
  TopicMetadataSyncOptionsSchema,
} from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/v1/acl_pb';
import { useSupportedFeaturesStore } from 'state/supported-features';
import { useUIStateStore } from 'state/ui-state';
import { render } from 'test-utils';

import { ShadowLinkEditPage } from './shadowlink-edit-page';
import {
  type Action,
  addACLFilter,
  addBootstrapServer,
  addConsumerFilter,
  addTopicFilter,
  addTopicFilterWithPattern,
  enableMTLS,
  enableSchemaRegistrySync,
  enableTLS,
  setSchemaRegistrySyncGateSupported,
  toggleExcludeDefault,
  updateAdvancedOption,
  updateMetadataMaxAge,
  uploadCACertificate,
  uploadClientCertificates,
} from '../shadowlink-test-helpers';

const SHADOW_LINK_NAME = 'test-shadow-link';
const EDIT_PATH = '/shadowlinks/$name/edit';

type UpdateRequest = MessageShape<typeof updateShadowLink.input>;

const createShadowLinkFixture = () =>
  create(ShadowLinkSchema, {
    name: 'test-shadow-link',
    uid: 'test-uid-123',
    state: ShadowLinkState.ACTIVE,
    configurations: create(ShadowLinkConfigurationsSchema, {
      clientOptions: {
        bootstrapServers: ['localhost:9092'],
        tlsSettings: undefined,
        authenticationConfiguration: create(AuthenticationConfigurationSchema, {
          authentication: {
            case: 'scramConfiguration',
            value: create(ScramConfigSchema, {
              username: 'test-user',
              password: 'test-pass',
              scramMechanism: ScramMechanism.SCRAM_SHA_256,
            }),
          },
        }),
        metadataMaxAgeMs: 10_000,
        connectionTimeoutMs: 1000,
        retryBackoffMs: 100,
        fetchWaitMaxMs: 500,
        fetchMinBytes: 5_242_880,
        fetchMaxBytes: 20_971_520,
        fetchPartitionMaxBytes: 1_048_576,
      },
      topicMetadataSyncOptions: create(TopicMetadataSyncOptionsSchema, {
        excludeDefault: true,
        syncedShadowTopicProperties: [],
        autoCreateShadowTopicFilters: [
          create(NameFilterSchema, {
            name: '*',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          }),
        ],
      }),
      consumerOffsetSyncOptions: undefined,
      securitySyncOptions: create(SecuritySettingsSyncOptionsSchema, {
        aclFilters: [],
      }),
    }),
  });

const performAction = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  action: Action
) => {
  switch (action.type) {
    case 'addBootstrapServer':
      return await addBootstrapServer(user, scr, action.value);
    case 'enableTLS':
      return await enableTLS(user, scr);
    case 'enableMTLS':
      return await enableMTLS(user, scr);
    case 'uploadCACertificate':
      return await uploadCACertificate(user, scr, action.pemContent);
    case 'uploadClientCertificates':
      return await uploadClientCertificates(user, scr, action.certPem, action.keyPem);
    case 'updateMetadataMaxAge':
      return await updateMetadataMaxAge(user, scr, action.value);
    case 'updateAdvancedOption':
      return await updateAdvancedOption(user, scr, action.field, action.value);
    case 'addTopicFilter':
      return await addTopicFilter(user, scr, action.name);
    case 'addTopicFilterWithPattern':
      return await addTopicFilterWithPattern(user, scr, action.options);
    case 'addConsumerFilter':
      return await addConsumerFilter(user, scr, action.name);
    case 'addACLFilter':
      return await addACLFilter(user, scr, action.principal);
    case 'toggleExcludeDefault':
      return await toggleExcludeDefault(user, scr);
    case 'enableSchemaRegistrySync':
      return await enableSchemaRegistrySync(user, scr);
    default:
      throw new Error(`Unknown action type: ${JSON.stringify(action)}`);
  }
};

type TestCase = {
  description: string;
  actions: Action[];
  expectedFieldMaskPaths: string[];
  verify: (updateRequest: UpdateRequest, exp: typeof import('@rstest/core').expect) => void;
};

const testCases: TestCase[] = [
  {
    description: 'updates comprehensive set of fields',
    actions: [
      { type: 'addBootstrapServer', value: 'localhost:9093' },
      { type: 'enableTLS' },
      { type: 'updateMetadataMaxAge', value: 20_000 },
      { type: 'addTopicFilter', name: 'first-topic' },
      { type: 'addConsumerFilter', name: 'my-consumer-group' },
      { type: 'addACLFilter', principal: 'User:alice' },
      { type: 'toggleExcludeDefault' },
    ],
    expectedFieldMaskPaths: [
      'configurations.client_options',
      'configurations.topic_metadata_sync_options',
      'configurations.consumer_offset_sync_options',
      'configurations.security_sync_options',
    ],
    verify: (updateRequest, exp) => {
      exp(updateRequest.updateMask?.paths).toHaveLength(4);
      exp(updateRequest.shadowLink?.configurations?.clientOptions?.bootstrapServers).toEqual([
        'localhost:9092',
        'localhost:9093',
      ]);
      exp(updateRequest.shadowLink?.configurations?.clientOptions?.tlsSettings?.enabled).toBe(true);
      exp(updateRequest.shadowLink?.configurations?.clientOptions?.metadataMaxAgeMs).toBe(20_000);
      exp(updateRequest.shadowLink?.configurations?.topicMetadataSyncOptions?.autoCreateShadowTopicFilters).toEqual([
        create(NameFilterSchema, {
          name: 'first-topic',
          patternType: PatternType.LITERAL,
          filterType: FilterType.INCLUDE,
        }),
      ]);
      exp(updateRequest.shadowLink?.configurations?.consumerOffsetSyncOptions?.groupFilters).toEqual([
        create(NameFilterSchema, {
          name: 'my-consumer-group',
          patternType: PatternType.LITERAL,
          filterType: FilterType.INCLUDE,
        }),
      ]);
      exp(updateRequest.shadowLink?.configurations?.securitySyncOptions?.aclFilters).toEqual([
        create(ACLFilterSchema, {
          resourceFilter: {
            resourceType: ACLResource.ACL_RESOURCE_ANY,
            patternType: ACLPattern.ACL_PATTERN_ANY,
            name: '',
          },
          accessFilter: {
            principal: 'User:alice',
            operation: ACLOperation.ACL_OPERATION_ANY,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ANY,
            host: '',
          },
        }),
      ]);
      exp(updateRequest.shadowLink?.configurations?.topicMetadataSyncOptions?.excludeDefault).toBe(false);
    },
  },
  {
    description: 'enables schema registry sync',
    actions: [{ type: 'enableSchemaRegistrySync' }],
    expectedFieldMaskPaths: ['configurations.schema_registry_sync_options'],
    verify: (updateRequest, exp) => {
      exp(updateRequest.updateMask?.paths).toHaveLength(1);
      exp(updateRequest.shadowLink?.configurations?.schemaRegistrySyncOptions).toBeDefined();
      exp(updateRequest.shadowLink?.configurations?.schemaRegistrySyncOptions?.schemaRegistryShadowingMode?.case).toBe(
        'shadowSchemaRegistryTopic'
      );
      exp(
        updateRequest.shadowLink?.configurations?.schemaRegistrySyncOptions?.schemaRegistryShadowingMode?.value
      ).toBeDefined();
    },
  },
];

function serveShadowLink(shadowLink: ShadowLink) {
  const writes: UpdateRequest[] = [];
  const transport = createRouterTransport(({ rpc }) => {
    rpc(getShadowLink, () => ({ shadowLink }));
    rpc(updateShadowLink, (request) => {
      writes.push(request);
      return {};
    });
  });
  return { writes, transport };
}

function renderEditPage(shadowLink: ShadowLink) {
  const { writes, transport } = serveShadowLink(shadowLink);
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: EDIT_PATH, component: ShadowLinkEditPage });
  const details = createRoute({ getParentRoute: () => root, path: '/shadowlinks/$name' });
  const history = createMemoryHistory({ initialEntries: [`/shadowlinks/${SHADOW_LINK_NAME}/edit`] });
  const router = createRouter({ history, routeTree: root.addChildren([route, details]) });
  onTestFinished(() => history.destroy());
  render(<RouterProvider router={router} />, { transport });
  return { writes, router };
}

async function saveAndReadUpdate(user: ReturnType<typeof userEvent.setup>, writes: UpdateRequest[]) {
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  const [update] = writes;
  if (!update) {
    throw new Error('Expected the edited shadow link to be sent');
  }
  expect(update.shadowLink?.name).toBe(SHADOW_LINK_NAME);
  return update;
}

const replaceInputValue = async (user: ReturnType<typeof userEvent.setup>, input: HTMLElement, value: string) => {
  await user.clear(input);
  await user.type(input, value);
};

describe('the ShadowLinkEditPage', () => {
  beforeEach(() => {
    const { jwt } = config;
    const features = useSupportedFeaturesStore.getState();
    const header = useUIStateStore.getState();
    config.jwt = undefined;
    onTestFinished(() => {
      config.jwt = jwt;
      useSupportedFeaturesStore.setState(features, true);
      useUIStateStore.setState(header, true);
    });
    useSupportedFeaturesStore.setState({
      endpointCompatibility: null,
      shadowLinkSchemaRegistrySync: false,
      shadowLinkRoleSync: false,
    });
  });

  test.each(testCases)('$description', async ({ actions, expectedFieldMaskPaths, verify }) => {
    const user = userEvent.setup();
    const { writes, router } = renderEditPage(createShadowLinkFixture());

    await screen.findByTestId('bootstrap-server-input-0');

    // WARNING: Do not run actions on the same form in parallel; later actions depend on earlier values.
    await actions.reduce<Promise<void>>(
      (previous, action) => previous.then(() => performAction(user, screen, action)),
      Promise.resolve()
    );

    const updateRequest = await saveAndReadUpdate(user, writes);

    expect(updateRequest?.updateMask?.paths).toEqual(expect.arrayContaining(expectedFieldMaskPaths));

    verify(updateRequest, expect);
    await waitFor(() => expect(router.state.location.pathname).toBe('/shadowlinks/test-shadow-link'));
  });

  describe('schema registry api mode', () => {
    const createApiModeShadowLink = () => {
      const link = createShadowLinkFixture();
      if (link.configurations) {
        link.configurations.schemaRegistrySyncOptions = create(SchemaRegistrySyncOptionsSchema, {
          schemaRegistryShadowingMode: {
            case: 'shadowSchemaRegistryApi',
            value: {
              sourceUrl: 'https://sr.example.com',
              authOptions: {
                authOptions: {
                  case: 'basic',
                  value: { username: 'sr-replicator', password: '', passwordSet: true },
                },
              },
              tlsSettings: { enabled: true },
              tailInterval: { seconds: 10n },
              sourceFilter: { contexts: ['.prod'] },
              paused: true,
            },
          },
        });
      }
      return link;
    };

    const openSrSyncBehavior = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(await screen.findByTestId('tab-shadowing'));
      await screen.findByTestId('sr-source-url-input');
      await user.click(screen.getByTestId('sr-sync-behavior-trigger'));
      await screen.findByTestId('sr-tail-interval-input');
    };

    const renderApiModeSyncBehavior = async () => {
      setSchemaRegistrySyncGateSupported(true);
      const user = userEvent.setup();
      const { writes } = renderEditPage(createApiModeShadowLink());
      await openSrSyncBehavior(user);
      return { user, writes };
    };

    test('edits an api-mode link with a retyped password and emits only the SR mask', async () => {
      const { user, writes } = await renderApiModeSyncBehavior();

      expect(screen.getByTestId('sr-mode-topic-tab')).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByTestId('sr-source-url-input')).toHaveValue('https://sr.example.com');

      const tailInput = screen.getByTestId('sr-tail-interval-input');
      expect(tailInput).toHaveValue('10s');
      await replaceInputValue(user, tailInput, '30s');
      await user.type(screen.getByTestId('sr-basic-password-input'), 'retyped-secret');

      const updateRequest = await saveAndReadUpdate(user, writes);

      expect(updateRequest.updateMask?.paths).toEqual(['configurations.schema_registry_sync_options']);
      expect(
        updateRequest.shadowLink?.configurations?.schemaRegistrySyncOptions?.schemaRegistryShadowingMode
      ).toMatchObject({
        case: 'shadowSchemaRegistryApi',
        value: {
          tailInterval: { seconds: 30n },
          authOptions: { authOptions: { case: 'basic', value: { password: 'retyped-secret' } } },
          paused: true,
        },
      });
    });

    test('blocks saving an api-mode link until the password is re-entered', async () => {
      const { user, writes } = await renderApiModeSyncBehavior();

      await replaceInputValue(user, screen.getByTestId('sr-tail-interval-input'), '30s');

      await user.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(screen.getByText('Password is required when HTTP Basic is enabled')).toBeInTheDocument();
      });
      expect(writes).toEqual([]);
    });

    test('keeps the read-only card for an api-mode link when the gate is closed', async () => {
      const user = userEvent.setup();
      renderEditPage(createApiModeShadowLink());
      await user.click(await screen.findByTestId('tab-shadowing'));

      await screen.findByTestId('sr-api-mode-readonly');
      expect(screen.queryByTestId('sr-mode-api-tab')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sr-enable-switch')).not.toBeInTheDocument();
    });

    test('saves unrelated edits on an api-mode link when the gate is closed', async () => {
      // WARNING: Do not require the password from the read-only basic-auth card; that hidden input would block saving unrelated edits.
      const user = userEvent.setup();
      const { writes } = renderEditPage(createApiModeShadowLink());

      await screen.findByTestId('bootstrap-server-input-0');
      await addTopicFilter(user, screen, 'unrelated-topic');

      const updateRequest = await saveAndReadUpdate(user, writes);

      expect(updateRequest.updateMask?.paths).toEqual(['configurations.topic_metadata_sync_options']);
    });
  });
});
