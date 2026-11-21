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
import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast as registryToast } from 'components/redpanda-ui/components/toast';
import {
  ListShadowLinksResponseSchema,
  UpdateShadowLinkResponseSchema,
} from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import {
  listShadowLinks,
  updateShadowLink,
} from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';
import {
  GetShadowLinkResponseSchema,
  type ShadowLink,
  ShadowLinkSchema,
} from 'protogen/redpanda/api/dataplane/v1/shadowlink_pb';
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
import { toast } from 'sonner';
import { useSupportedFeaturesStore } from 'state/supported-features';
import { renderWithFileRoutes } from 'test-utils';

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

// Record the real hook's outgoing protobuf request, not a rebuilt approximation.
const mockUpdateShadowLink =
  rs.fn<
    (request: MessageShape<typeof updateShadowLink.input>) => Promise<MessageShape<typeof updateShadowLink.output>>
  >();

// Mock config
rs.mock('runtime-config', () => {
  const actual = rs.requireActual<typeof import('runtime-config')>('runtime-config');
  return {
    ...actual,
    config: {
      jwt: 'test-jwt-token',
    },
    isFeatureFlagEnabled: rs.fn(() => false),
    isEmbedded: () => false,
  };
});

// Mock toast notifications
rs.mock('sonner', () => ({
  toast: {
    success: rs.fn(),
    error: rs.fn(),
  },
}));

const SHADOW_LINK_NAME = 'test-shadow-link';

rs.mock('@tanstack/react-router', () => {
  const actual = rs.requireActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');
  return {
    ...actual,
    useParams: () => ({ name: SHADOW_LINK_NAME }),
  };
});

/**
 * Create a mock shadow link with minimal configuration
 */
const createMockShadowLink = (): ShadowLink =>
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

/**
 * Render the edit page with all necessary providers
 */
const renderEditPage = (shadowLink: ShadowLink) =>
  renderWithFileRoutes(<ShadowLinkEditPage />, {
    transport: createRouterTransport(({ rpc }) => {
      rpc(getShadowLink, () => create(GetShadowLinkResponseSchema, { shadowLink }));
      rpc(updateShadowLink, (request) => mockUpdateShadowLink(request));
      rpc(listShadowLinks, () => create(ListShadowLinksResponseSchema));
    }),
  });

/**
 * Action dispatcher - routes actions to appropriate helpers
 */
const performAction = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  action: Action
): Promise<void> => {
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

/**
 * Test case type definition
 */
type TestCase = {
  description: string;
  actions: Action[];
  expectedFieldMaskPaths: string[];
  verify: (
    updateRequest: Awaited<ReturnType<typeof saveUpdateRequest>>,
    exp: typeof import('@rstest/core').expect
  ) => void;
};

/**
 * Test cases for table-driven testing
 *
 * Note: pure `buildDataplaneUpdateRequest` behaviours (field mask / request
 * payload given a form-values diff) live in `shadowlink-edit-utils.test.ts`.
 * These DOM tests only cover end-to-end wiring from the form UI to the hook.
 */
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
      exp(updateRequest.updateMask.paths).toHaveLength(4);
      exp(updateRequest.shadowLink.configurations.clientOptions.bootstrapServers).toEqual([
        'localhost:9092',
        'localhost:9093',
      ]);
      exp(updateRequest.shadowLink.configurations.clientOptions.tlsSettings?.enabled).toBe(true);
      exp(updateRequest.shadowLink.configurations.clientOptions.metadataMaxAgeMs).toBe(20_000);
      exp(updateRequest.shadowLink.configurations.topicMetadataSyncOptions?.autoCreateShadowTopicFilters).toEqual([
        create(NameFilterSchema, {
          name: 'first-topic',
          patternType: PatternType.LITERAL,
          filterType: FilterType.INCLUDE,
        }),
      ]);
      exp(updateRequest.shadowLink.configurations.consumerOffsetSyncOptions?.groupFilters).toEqual([
        create(NameFilterSchema, {
          name: 'my-consumer-group',
          patternType: PatternType.LITERAL,
          filterType: FilterType.INCLUDE,
        }),
      ]);
      exp(updateRequest.shadowLink.configurations.securitySyncOptions?.aclFilters).toEqual([
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
      exp(updateRequest.shadowLink.configurations.topicMetadataSyncOptions?.excludeDefault).toBe(false);
    },
  },
  {
    description: 'enables schema registry sync',
    actions: [{ type: 'enableSchemaRegistrySync' }],
    expectedFieldMaskPaths: ['configurations.schema_registry_sync_options'],
    verify: (updateRequest, exp) => {
      exp(updateRequest.updateMask.paths).toHaveLength(1);
      exp(updateRequest.shadowLink.configurations.schemaRegistrySyncOptions).toBeDefined();
      exp(updateRequest.shadowLink.configurations.schemaRegistrySyncOptions?.schemaRegistryShadowingMode?.case).toBe(
        'shadowSchemaRegistryTopic'
      );
      exp(
        updateRequest.shadowLink.configurations.schemaRegistrySyncOptions?.schemaRegistryShadowingMode?.value
      ).toBeDefined();
    },
  },
];

/** Save through the real form and return exactly what crossed the RPC boundary. */
const saveUpdateRequest = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByText('Save'));
  await waitFor(() => {
    expect(mockUpdateShadowLink).toHaveBeenCalledTimes(1);
  });
  const request = mockUpdateShadowLink.mock.calls.at(0)?.[0];
  const shadowLink = request?.shadowLink;
  const configurations = shadowLink?.configurations;
  const clientOptions = configurations?.clientOptions;
  const updateMask = request?.updateMask;
  if (!(request && shadowLink && configurations && clientOptions && updateMask)) {
    throw new Error('Expected a complete shadow-link update request');
  }
  return {
    ...request,
    updateMask,
    shadowLink: { ...shadowLink, configurations: { ...configurations, clientOptions } },
  };
};

const replaceInputValue = async (user: ReturnType<typeof userEvent.setup>, input: HTMLElement, value: string) => {
  await user.clear(input);
  await user.type(input, value);
};

describe('the ShadowLinkEditPage', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    mockUpdateShadowLink.mockReset();
    mockUpdateShadowLink.mockResolvedValue(create(UpdateShadowLinkResponseSchema));
    // The SR and role sync feature gates default to closed; api-mode tests seed SR open.
    useSupportedFeaturesStore.setState({
      endpointCompatibility: null,
      shadowLinkSchemaRegistrySync: false,
      shadowLinkRoleSync: false,
    });
  });

  test.each(testCases)('$description', async ({ actions, expectedFieldMaskPaths, verify }) => {
    const user = userEvent.setup();
    const mockShadowLink = createMockShadowLink();
    renderEditPage(mockShadowLink);

    // Wait for the form to load
    await waitFor(() => {
      expect(screen.getByTestId('shadowLink-edit-page-description')).toBeInTheDocument();
    });

    // Wait for the source tab content to be visible
    await screen.findByTestId('bootstrap-server-input-0', {}, { timeout: 5000 });

    // Each action edits the same form and later actions read its state, so chain them in order.
    await actions.reduce<Promise<void>>(
      (previous, action) => previous.then(() => performAction(user, screen, action)),
      Promise.resolve()
    );

    const updateRequest = await saveUpdateRequest(user);

    // Verify field mask includes all expected paths
    expect(updateRequest?.updateMask?.paths).toEqual(expect.arrayContaining(expectedFieldMaskPaths));

    // Run custom verification function
    verify(updateRequest, expect);
  });

  test('reports rejected updates once without a generic second error', async () => {
    const user = userEvent.setup();
    const genericToast = rs.spyOn(registryToast, 'add');
    mockUpdateShadowLink.mockRejectedValue(new ConnectError('Update denied', Code.PermissionDenied));
    renderEditPage(createMockShadowLink());
    await screen.findByTestId('bootstrap-server-input-0');
    await addBootstrapServer(user, screen, 'localhost:9093');
    await user.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(rs.mocked(toast.error).mock.calls).toEqual([
        ['Shadow link update failed', { description: '[permission_denied] Update denied' }],
      ]);
    });
    expect(genericToast).not.toHaveBeenCalled();
    genericToast.mockRestore();
  });

  describe('schema registry api mode', () => {
    const createApiModeShadowLink = (): ShadowLink => {
      const link = createMockShadowLink();
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
      await user.click(screen.getByTestId('tab-shadowing'));
      await screen.findByTestId('sr-source-url-input');
      await user.click(screen.getByTestId('sr-sync-behavior-trigger'));
      await screen.findByTestId('sr-tail-interval-input');
    };

    // With the SR gate open, render an api-mode link and open its sync behavior fields
    const renderApiModeSyncBehavior = async () => {
      setSchemaRegistrySyncGateSupported(true);
      const user = userEvent.setup();
      const mockShadowLink = createApiModeShadowLink();
      renderEditPage(mockShadowLink);
      await openSrSyncBehavior(user);
      return { user, mockShadowLink };
    };

    test('edits an api-mode link with a retyped password and emits only the SR mask', async () => {
      const { user } = await renderApiModeSyncBehavior();

      // The topic tab is locked for an api-mode link.
      expect(screen.getByTestId('sr-mode-topic-tab')).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByTestId('sr-source-url-input')).toHaveValue('https://sr.example.com');

      const tailInput = screen.getByTestId('sr-tail-interval-input');
      expect(tailInput).toHaveValue('10s');
      await replaceInputValue(user, tailInput, '30s');
      await user.type(screen.getByTestId('sr-basic-password-input'), 'retyped-secret');

      const updateRequest = await saveUpdateRequest(user);

      expect(updateRequest.updateMask?.paths).toEqual(['configurations.schema_registry_sync_options']);
      expect(
        updateRequest.shadowLink?.configurations?.schemaRegistrySyncOptions?.schemaRegistryShadowingMode
      ).toMatchObject({
        case: 'shadowSchemaRegistryApi',
        value: {
          tailInterval: { seconds: 30n },
          authOptions: { authOptions: { case: 'basic', value: { password: 'retyped-secret' } } },
          // paused was hydrated and must survive the rebuild
          paused: true,
        },
      });
    });

    test('blocks saving an api-mode link until the password is re-entered', async () => {
      const { user } = await renderApiModeSyncBehavior();

      await replaceInputValue(user, screen.getByTestId('sr-tail-interval-input'), '30s');

      await user.click(screen.getByText('Save'));

      await waitFor(() => {
        expect(screen.getByText('Password is required when HTTP Basic is enabled')).toBeInTheDocument();
      });
      expect(mockUpdateShadowLink).not.toHaveBeenCalled();
    });

    test('keeps the read-only card for an api-mode link when the gate is closed', async () => {
      const user = userEvent.setup();
      const mockShadowLink = createApiModeShadowLink();

      renderEditPage(mockShadowLink);
      await user.click(screen.getByTestId('tab-shadowing'));

      await screen.findByTestId('sr-api-mode-readonly');
      expect(screen.queryByTestId('sr-mode-api-tab')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sr-enable-switch')).not.toBeInTheDocument();
    });

    test('saves unrelated edits on an api-mode link when the gate is closed', async () => {
      // The hydrated basic-auth password can never be re-entered behind the
      // read-only card, so its validation must not block the rest of the form.
      const user = userEvent.setup();
      const mockShadowLink = createApiModeShadowLink();
      renderEditPage(mockShadowLink);

      await screen.findByTestId('bootstrap-server-input-0');
      await addTopicFilter(user, screen, 'unrelated-topic');

      const updateRequest = await saveUpdateRequest(user);

      // Only the topic change goes out; the untouched SR slice emits no mask.
      expect(updateRequest.updateMask?.paths).toEqual(['configurations.topic_metadata_sync_options']);
    });
  });
});
