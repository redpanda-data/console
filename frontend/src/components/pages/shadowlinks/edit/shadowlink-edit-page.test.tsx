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
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ShadowLink, ShadowLinkSchema } from 'protogen/redpanda/api/dataplane/v1/shadowlink_pb';
import {
  ACLFilterSchema,
  AuthenticationConfigurationSchema,
  FilterType,
  NameFilterSchema,
  PatternType,
  ScramConfigSchema,
  ScramMechanism,
  SecuritySettingsSyncOptionsSchema,
  ShadowLinkConfigurationsSchema,
  ShadowLinkState,
  TopicMetadataSyncOptionsSchema,
} from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/v1/acl_pb';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { ShadowLinkEditPage } from './shadowlink-edit-page';

// Mock the hooks
vi.mock('react-query/api/shadowlink', () => ({
  useEditShadowLink: vi.fn(),
}));

// Mock ui-state
vi.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

// Mock config
vi.mock('config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('config')>();
  return {
    ...actual,
    config: {
      jwt: 'test-jwt-token',
    },
    isFeatureFlagEnabled: vi.fn(() => false),
  };
});

// Mock toast notifications
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const SHADOW_LINK_NAME = 'test-shadow-link';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useParams: () => ({ name: SHADOW_LINK_NAME }),
  };
});

import { useEditShadowLink } from 'react-query/api/shadowlink';
import { renderWithFileRoutes } from 'test-utils';

import { buildDefaultFormValues } from '../mappers/dataplane';
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
  toggleExcludeDefault,
  updateAdvancedOption,
  updateMetadataMaxAge,
  uploadCACertificate,
  uploadClientCertificates,
} from '../shadowlink-test-helpers';

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
  }) as ShadowLink;

/**
 * Render the edit page with all necessary providers
 */
const renderEditPage = (_shadowLink: ShadowLink) => renderWithFileRoutes(<ShadowLinkEditPage />);

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
  verify: (updateRequest: any, exp: typeof import('vitest').expect) => void;
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

describe('ShadowLinkEditPage', () => {
  const mockUpdateShadowLink = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateShadowLink.mockImplementation((_request) => Promise.resolve({}));
  });

  test.each(testCases)('$description', async ({ actions, expectedFieldMaskPaths, verify }) => {
    const user = userEvent.setup();
    const mockShadowLink = createMockShadowLink();
    const formValues = buildDefaultFormValues(mockShadowLink);

    // Mock useEditShadowLink hook
    vi.mocked(useEditShadowLink).mockReturnValue({
      formValues,
      isLoading: false,
      error: null,
      isUpdating: false,
      hasData: true,
      updateShadowLink: mockUpdateShadowLink,
      dataplaneUpdate: {
        isPending: false,
        isSuccess: false,
        isError: false,
        error: null,
        reset: vi.fn(),
      } as any,
      controlplaneUpdate: {
        isPending: false,
        isSuccess: false,
        isError: false,
        error: null,
        reset: vi.fn(),
      } as any,
    });

    renderEditPage(mockShadowLink);

    // Wait for the form to load
    await waitFor(() => {
      expect(screen.getByTestId('shadowLink-edit-page-description')).toBeInTheDocument();
    });

    // Wait for the source tab content to be visible
    await screen.findByTestId('bootstrap-server-input-0', {}, { timeout: 5000 });

    // Execute all actions in sequence
    for (const action of actions) {
      await performAction(user, screen, action);
    }

    // Submit the form
    const saveButton = screen.getByText('Save');
    await user.click(saveButton);

    // Verify updateShadowLink was called
    await waitFor(() => {
      expect(mockUpdateShadowLink).toHaveBeenCalledTimes(1);
    });

    const formValuesArg = mockUpdateShadowLink.mock.calls[0][0];

    // The test verifies form values, but the hook now builds the request internally
    // We need to build the request from form values to verify the update request structure
    const { buildDataplaneUpdateRequest } = await import('./shadowlink-edit-utils');
    const updateRequest = buildDataplaneUpdateRequest('test-shadow-link', formValuesArg, mockShadowLink);

    // Verify field mask includes all expected paths
    const fieldMaskPaths = updateRequest?.updateMask?.paths;
    for (const expectedPath of expectedFieldMaskPaths) {
      expect(fieldMaskPaths).toContain(expectedPath);
    }

    // Run custom verification function
    verify(updateRequest, expect);
  });
});
