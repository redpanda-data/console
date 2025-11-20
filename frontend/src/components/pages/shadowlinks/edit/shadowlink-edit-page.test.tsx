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
import { type ShadowLink, ShadowLinkSchema } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
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
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/acl_pb';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { ShadowLinkEditPage } from './shadowlink-edit-page';

// Mock the hooks
vi.mock('react-query/api/shadowlink', () => ({
  useGetShadowLinkQuery: vi.fn(),
  useUpdateShadowLinkMutation: vi.fn(),
}));

// Mock ui-state
vi.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

// Mock toast notifications
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock react-router navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { useGetShadowLinkQuery, useUpdateShadowLinkMutation } from 'react-query/api/shadowlink';
import { render } from 'test-utils';

import {
  type Action,
  addACLFilter,
  addBootstrapServer,
  addConsumerFilter,
  addTopicFilter,
  addTopicFilterWithPattern,
  enableMTLS,
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
const renderEditPage = (shadowLink: ShadowLink) =>
  render(
    <MemoryRouter initialEntries={[`/shadowlinks/${shadowLink.name}/edit`]}>
      <Routes>
        <Route element={<ShadowLinkEditPage />} path="/shadowlinks/:name/edit" />
      </Routes>
    </MemoryRouter>
  );

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
 */
const testCases: TestCase[] = [
  {
    description: 'updates bootstrap server only',
    actions: [{ type: 'addBootstrapServer', value: 'localhost:9093' }],
    expectedFieldMaskPaths: ['configurations.client_options'],
    verify: (updateRequest, exp) => {
      exp(updateRequest.updateMask.paths).toHaveLength(1);
      exp(updateRequest.shadowLink.configurations.clientOptions.bootstrapServers).toEqual([
        'localhost:9092',
        'localhost:9093',
      ]);
    },
  },
  {
    description: 'updates TLS and advanced options',
    actions: [{ type: 'enableTLS' }, { type: 'updateMetadataMaxAge', value: 20_000 }],
    expectedFieldMaskPaths: [
      'configurations.client_options.tls_settings',
      'configurations.client_options.metadata_max_age_ms',
    ],
    verify: (updateRequest, exp) => {
      exp(updateRequest.updateMask.paths).toHaveLength(2);
      exp(updateRequest.shadowLink.configurations.clientOptions.tlsSettings?.enabled).toBe(true);
      exp(updateRequest.shadowLink.configurations.clientOptions.metadataMaxAgeMs).toBe(20_000);
    },
  },
  {
    description: 'updates all filter types',
    actions: [
      { type: 'addTopicFilter', name: 'my-topic' },
      { type: 'addConsumerFilter', name: 'my-consumer' },
      { type: 'addACLFilter', principal: 'User:bob' },
    ],
    expectedFieldMaskPaths: [
      'configurations.topic_metadata_sync_options',
      'configurations.consumer_offset_sync_options',
      'configurations.security_sync_options',
    ],
    verify: (updateRequest, exp) => {
      exp(updateRequest.updateMask.paths).toHaveLength(3);
      exp(updateRequest.shadowLink.configurations.topicMetadataSyncOptions?.autoCreateShadowTopicFilters).toEqual([
        create(NameFilterSchema, {
          name: 'my-topic',
          patternType: PatternType.LITERAL,
          filterType: FilterType.INCLUDE,
        }),
      ]);
      exp(updateRequest.shadowLink.configurations.consumerOffsetSyncOptions?.groupFilters).toEqual([
        create(NameFilterSchema, {
          name: 'my-consumer',
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
            principal: 'User:bob',
            operation: ACLOperation.ACL_OPERATION_ANY,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ANY,
            host: '',
          },
        }),
      ]);
    },
  },
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
    description: 'adds multiple topic filters with different patterns',
    actions: [
      {
        type: 'addTopicFilterWithPattern',
        options: { name: 'exact-topic', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE },
      },
      {
        type: 'addTopicFilterWithPattern',
        options: { name: 'exclude-', patternType: PatternType.PREFIX, filterType: FilterType.EXCLUDE },
      },
      {
        type: 'addTopicFilterWithPattern',
        options: { name: 'include-', patternType: PatternType.PREFIX, filterType: FilterType.INCLUDE },
      },
    ],
    expectedFieldMaskPaths: ['configurations.topic_metadata_sync_options'],
    verify: (updateRequest, exp) => {
      exp(updateRequest.updateMask.paths).toHaveLength(1);
      exp(updateRequest.shadowLink.configurations.topicMetadataSyncOptions?.autoCreateShadowTopicFilters).toHaveLength(
        3
      );
      exp(updateRequest.shadowLink.configurations.topicMetadataSyncOptions?.autoCreateShadowTopicFilters).toEqual([
        create(NameFilterSchema, {
          name: 'exact-topic',
          patternType: PatternType.LITERAL,
          filterType: FilterType.INCLUDE,
        }),
        create(NameFilterSchema, { name: 'exclude-', patternType: PatternType.PREFIX, filterType: FilterType.EXCLUDE }),
        create(NameFilterSchema, { name: 'include-', patternType: PatternType.PREFIX, filterType: FilterType.INCLUDE }),
      ]);
    },
  },
  {
    description: 'updates multiple advanced client options',
    actions: [
      { type: 'updateMetadataMaxAge', value: 30_000 },
      { type: 'updateAdvancedOption', field: 'connection-timeout', value: 2000 },
      { type: 'updateAdvancedOption', field: 'retry-backoff', value: 200 },
      { type: 'updateAdvancedOption', field: 'fetch-wait-max', value: 1000 },
    ],
    expectedFieldMaskPaths: [
      'configurations.client_options.metadata_max_age_ms',
      'configurations.client_options.connection_timeout_ms',
      'configurations.client_options.retry_backoff_ms',
      'configurations.client_options.fetch_wait_max_ms',
    ],
    verify: (updateRequest, exp) => {
      exp(updateRequest.updateMask.paths).toHaveLength(4);
      exp(updateRequest.shadowLink.configurations.clientOptions.metadataMaxAgeMs).toBe(30_000);
      exp(updateRequest.shadowLink.configurations.clientOptions.connectionTimeoutMs).toBe(2000);
      exp(updateRequest.shadowLink.configurations.clientOptions.retryBackoffMs).toBe(200);
      exp(updateRequest.shadowLink.configurations.clientOptions.fetchWaitMaxMs).toBe(1000);
    },
  },
  {
    description: 'handles cross-tab workflow maintaining state',
    actions: [
      { type: 'addBootstrapServer', value: 'cross-tab:9092' },
      { type: 'addTopicFilter', name: 'cross-topic' },
      { type: 'toggleExcludeDefault' },
      { type: 'addConsumerFilter', name: 'cross-consumer' },
    ],
    expectedFieldMaskPaths: [
      'configurations.client_options',
      'configurations.topic_metadata_sync_options',
      'configurations.consumer_offset_sync_options',
    ],
    verify: (updateRequest, exp) => {
      exp(updateRequest.updateMask.paths).toHaveLength(3);
      exp(updateRequest.shadowLink.configurations.clientOptions.bootstrapServers).toContain('cross-tab:9092');
      exp(updateRequest.shadowLink.configurations.topicMetadataSyncOptions?.autoCreateShadowTopicFilters).toHaveLength(
        1
      );
      exp(updateRequest.shadowLink.configurations.consumerOffsetSyncOptions?.groupFilters).toHaveLength(1);
      exp(updateRequest.shadowLink.configurations.topicMetadataSyncOptions?.excludeDefault).toBe(false);
    },
  },
  {
    description: 'updates only some filter types, not all',
    actions: [
      { type: 'addTopicFilter', name: 'selective-topic' },
      { type: 'addConsumerFilter', name: 'selective-consumer' },
    ],
    expectedFieldMaskPaths: [
      'configurations.topic_metadata_sync_options',
      'configurations.consumer_offset_sync_options',
    ],
    verify: (updateRequest, exp) => {
      exp(updateRequest.updateMask.paths).toHaveLength(2);
      exp(updateRequest.shadowLink.configurations.topicMetadataSyncOptions?.autoCreateShadowTopicFilters).toHaveLength(
        1
      );
      exp(updateRequest.shadowLink.configurations.consumerOffsetSyncOptions?.groupFilters).toHaveLength(1);
      exp(updateRequest.updateMask.paths).not.toContain('configurations.security_sync_options');
    },
  },
];

describe('ShadowLinkEditPage', () => {
  const mockMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockMutateAsync.mockImplementation((_request) => Promise.resolve({}));

    // Mock update mutation
    vi.mocked(useUpdateShadowLinkMutation).mockImplementation(
      () =>
        ({
          mutateAsync: mockMutateAsync,
          isPending: false,
          isError: false,
          isSuccess: false,
          error: null,
          data: undefined,
          mutate: vi.fn(),
          reset: vi.fn(),
          status: 'idle',
          variables: undefined,
          context: undefined,
          failureCount: 0,
          failureReason: null,
          isPaused: false,
          submittedAt: 0,
        }) as any
    );
  });

  test.each(testCases)('$description', async ({ actions, expectedFieldMaskPaths, verify }) => {
    const user = userEvent.setup();
    const mockShadowLink = createMockShadowLink();

    // Mock get query
    vi.mocked(useGetShadowLinkQuery).mockReturnValue({
      data: { shadowLink: mockShadowLink },
      isLoading: false,
      error: null,
      isError: false,
      isSuccess: true,
      status: 'success',
    } as any);

    renderEditPage(mockShadowLink);

    // Wait for the form to load
    await waitFor(() => {
      expect(screen.getByText('Edit shadow link')).toBeInTheDocument();
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

    // Verify mutateAsync was called
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    });

    const updateRequest = mockMutateAsync.mock.calls[0][0];

    // Verify field mask includes all expected paths
    const fieldMaskPaths = updateRequest.updateMask.paths;
    for (const expectedPath of expectedFieldMaskPaths) {
      expect(fieldMaskPaths).toContain(expectedPath);
    }

    // Run custom verification function
    verify(updateRequest, expect);
  });
});
