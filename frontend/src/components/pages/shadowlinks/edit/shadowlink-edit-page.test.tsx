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

/**
 * Action types for table-driven tests
 */
type Action =
  | { type: 'addBootstrapServer'; value: string }
  | { type: 'enableTLS' }
  | { type: 'enableMTLS' }
  | { type: 'uploadCACertificate'; pemContent: string }
  | { type: 'uploadClientCertificates'; certPem: string; keyPem: string }
  | { type: 'updateMetadataMaxAge'; value: number }
  | { type: 'updateAdvancedOption'; field: string; value: number }
  | { type: 'addTopicFilter'; name: string }
  | { type: 'addTopicFilterWithPattern'; options: { name: string; patternType: PatternType; filterType: FilterType } }
  | { type: 'addConsumerFilter'; name: string }
  | { type: 'addACLFilter'; principal: string }
  | { type: 'toggleExcludeDefault' };

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
 * Action helper functions - each handles its own navigation
 */

// Regex patterns for inputs
const BOOTSTRAP_SERVER_INPUT_PATTERN = /bootstrap-server-input-\d+/;
const TOPIC_FILTER_NAME_PATTERN = /topic-filter-\d+-name/;

const addBootstrapServer = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  value: string
) => {
  const addButton = scr.getByTestId('add-bootstrap-server-button');
  await user.click(addButton);

  const inputs = scr.getAllByTestId(BOOTSTRAP_SERVER_INPUT_PATTERN);
  const newInput = inputs.at(-1);
  if (!newInput) {
    throw new Error('No bootstrap server input found after clicking add button');
  }
  await user.type(newInput, value);
};

const enableTLS = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen
) => {
  const tlsEnabledTab = scr.getByTestId('tls-enabled-tab');
  await user.click(tlsEnabledTab);
};

const updateMetadataMaxAge = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  value: number
) => {
  const advancedOptionsToggle = scr.getByTestId('advanced-options-toggle');
  await user.click(advancedOptionsToggle);

  await waitFor(() => {
    expect(scr.getByTestId('advanced-options-content')).toBeInTheDocument();
  });

  const metadataMaxAgeInput = scr.getByTestId('metadata-max-age-ms-input');
  await user.clear(metadataMaxAgeInput);
  await user.type(metadataMaxAgeInput, value.toString());
};

const addTopicFilter = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  name: string
) => {
  // Navigate to Shadowing tab
  const shadowingTab = scr.getByTestId('tab-shadowing');
  await user.click(shadowingTab);

  await waitFor(() => {
    expect(scr.getByTestId('topics-toggle-button')).toBeInTheDocument();
  });

  // Expand topics section
  const topicsToggle = scr.getByTestId('topics-toggle-button');
  await user.click(topicsToggle);

  await waitFor(() => {
    expect(scr.getByTestId('topics-specify-tab')).toBeInTheDocument();
  });

  // Switch to specify mode
  const topicsSpecifyTab = scr.getByTestId('topics-specify-tab');
  await user.click(topicsSpecifyTab);

  await waitFor(() => {
    expect(scr.getByTestId('add-topic-filter-button')).toBeInTheDocument();
  });

  // Find the first empty filter and fill it
  await waitFor(() => {
    expect(scr.getByTestId('topic-filter-0-name')).toBeInTheDocument();
  });

  const topicFilterInput = scr.getByTestId('topic-filter-0-name');
  await user.type(topicFilterInput, name);
};

const addConsumerFilter = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  name: string
) => {
  // Navigate to Shadowing tab (may already be there)
  const shadowingTab = scr.queryByTestId('tab-shadowing');
  if (shadowingTab) {
    await user.click(shadowingTab);
  }

  await waitFor(() => {
    expect(scr.getByTestId('consumers-toggle-button')).toBeInTheDocument();
  });

  // Expand consumers section
  const consumersToggle = scr.getByTestId('consumers-toggle-button');
  await user.click(consumersToggle);

  await waitFor(() => {
    expect(scr.getByTestId('consumers-specify-tab')).toBeInTheDocument();
  });

  // Switch to specify mode
  const consumersSpecifyTab = scr.getByTestId('consumers-specify-tab');
  await user.click(consumersSpecifyTab);

  await waitFor(() => {
    expect(scr.getByTestId('add-consumer-filter-button')).toBeInTheDocument();
  });

  // Add a consumer filter
  const addConsumerFilterButton = scr.getByTestId('add-consumer-filter-button');
  await user.click(addConsumerFilterButton);

  await waitFor(() => {
    expect(scr.getByTestId('consumer-filter-0-name')).toBeInTheDocument();
  });

  const consumerFilterInput = scr.getByTestId('consumer-filter-0-name');
  await user.type(consumerFilterInput, name);
};

const addACLFilter = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  principal: string
) => {
  // Navigate to Shadowing tab (may already be there)
  const shadowingTab = scr.queryByTestId('tab-shadowing');
  if (shadowingTab) {
    await user.click(shadowingTab);
  }

  await waitFor(() => {
    expect(scr.getByTestId('acls-toggle-button')).toBeInTheDocument();
  });

  // Expand ACLs section
  const aclsToggle = scr.getByTestId('acls-toggle-button');
  await user.click(aclsToggle);

  await waitFor(() => {
    expect(scr.getByTestId('acls-specify-tab')).toBeInTheDocument();
  });

  // Switch to specify mode
  const aclsSpecifyTab = scr.getByTestId('acls-specify-tab');
  await user.click(aclsSpecifyTab);

  await waitFor(() => {
    expect(scr.getByTestId('add-acl-filter-button')).toBeInTheDocument();
  });

  // Add an ACL filter
  const addAclFilterButton = scr.getByTestId('add-acl-filter-button');
  await user.click(addAclFilterButton);

  await waitFor(() => {
    expect(scr.getByTestId('acl-filter-0-principal')).toBeInTheDocument();
  });

  const aclPrincipalInput = scr.getByTestId('acl-filter-0-principal');
  await user.type(aclPrincipalInput, principal);
};

const toggleExcludeDefault = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen
) => {
  // Navigate to Topic Config tab
  const topicConfigTab = scr.getByTestId('tab-topic-config');
  await user.click(topicConfigTab);

  await waitFor(() => {
    expect(scr.getByTestId('exclude-default-switch')).toBeInTheDocument();
  });

  const excludeDefaultSwitch = scr.getByTestId('exclude-default-switch');
  await user.click(excludeDefaultSwitch);
};

const enableMTLS = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen
) => {
  const mtlsEnabledTab = scr.getByTestId('mtls-enabled-tab');
  await user.click(mtlsEnabledTab);
};

const uploadCACertificate = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  pemContent: string
) => {
  const addCaButton = scr.getByTestId('add-ca-button');
  await user.click(addCaButton);

  await waitFor(() => {
    expect(scr.getByTestId('ca-pem-input')).toBeInTheDocument();
  });

  const caInput = scr.getByTestId('ca-pem-input');
  await user.type(caInput, pemContent);
};

const uploadClientCertificates = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  certPem: string,
  keyPem: string
) => {
  // Upload client certificate
  const addClientCertButton = scr.getByTestId('add-clientCert-button');
  await user.click(addClientCertButton);

  await waitFor(() => {
    expect(scr.getByTestId('clientCert-pem-input')).toBeInTheDocument();
  });

  const certInput = scr.getByTestId('clientCert-pem-input');
  await user.type(certInput, certPem);

  // Upload client key
  const addClientKeyButton = scr.getByTestId('add-clientKey-button');
  await user.click(addClientKeyButton);

  await waitFor(() => {
    expect(scr.getByTestId('clientKey-pem-input')).toBeInTheDocument();
  });

  const keyInput = scr.getByTestId('clientKey-pem-input');
  await user.type(keyInput, keyPem);
};

const addTopicFilterWithPattern = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  options: { name: string; patternType: PatternType; filterType: FilterType }
) => {
  const { name, patternType, filterType } = options;
  // Navigate to Shadowing tab if not already there
  const currentTab = scr.queryByTestId('tab-shadowing');
  if (currentTab && currentTab.getAttribute('data-state') !== 'active') {
    await user.click(currentTab);
  }

  await waitFor(() => {
    expect(scr.getByTestId('topics-toggle-button')).toBeInTheDocument();
  });

  // Expand topics section if not already expanded
  const topicsContent = scr.queryByTestId('topics-filters-container');
  if (!topicsContent) {
    const topicsToggle = scr.getByTestId('topics-toggle-button');
    await user.click(topicsToggle);
  }

  await waitFor(() => {
    expect(scr.getByTestId('topics-specify-tab')).toBeInTheDocument();
  });

  // Switch to specify mode if not already in it
  const specifyTab = scr.getByTestId('topics-specify-tab');
  if (specifyTab.getAttribute('data-state') !== 'active') {
    await user.click(specifyTab);
  }

  await waitFor(() => {
    expect(scr.getByTestId('add-topic-filter-button')).toBeInTheDocument();
  });

  // Count existing filters and determine if we need to add a new one or fill an empty one
  const existingNameInputs = scr.queryAllByTestId(TOPIC_FILTER_NAME_PATTERN);
  let filterIndex = 0;

  // Check if filter 0 exists and is empty (from mode switch)
  if (existingNameInputs.length > 0) {
    const firstFilter = existingNameInputs[0];
    const firstValue = (firstFilter as HTMLInputElement).value;

    if (firstValue) {
      // First filter is filled, add a new one
      const addButton = scr.getByTestId('add-topic-filter-button');
      await user.click(addButton);
      filterIndex = existingNameInputs.length;

      await waitFor(() => {
        expect(scr.getByTestId(`topic-filter-${filterIndex}-name`)).toBeInTheDocument();
      });
    }
    // else: filter 0 is empty, use it
  }

  // Fill in name
  const nameInput = scr.getByTestId(`topic-filter-${filterIndex}-name`);
  await user.type(nameInput, name);

  // Set pattern and filter type
  let tabTestId = `topic-filter-${filterIndex}-`;
  if (filterType === FilterType.INCLUDE && patternType === PatternType.LITERAL) {
    tabTestId += 'include-specific';
  } else if (filterType === FilterType.INCLUDE && patternType === PatternType.PREFIX) {
    tabTestId += 'include-prefix';
  } else if (filterType === FilterType.EXCLUDE && patternType === PatternType.LITERAL) {
    tabTestId += 'exclude-specific';
  } else if (filterType === FilterType.EXCLUDE && patternType === PatternType.PREFIX) {
    tabTestId += 'exclude-prefix';
  }

  const patternTab = scr.getByTestId(tabTestId);
  await user.click(patternTab);
};

const updateAdvancedOption = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  field: string,
  value: number
) => {
  // Expand advanced options if not already expanded
  const advancedContent = scr.queryByTestId('advanced-options-content');
  if (!advancedContent) {
    const advancedOptionsToggle = scr.getByTestId('advanced-options-toggle');
    await user.click(advancedOptionsToggle);

    await waitFor(() => {
      expect(scr.getByTestId('advanced-options-content')).toBeInTheDocument();
    });
  }

  // Get the field container and find the input within it
  const fieldContainer = scr.getByTestId(`${field}-field`);
  const fieldInput = fieldContainer.querySelector('input');
  if (!fieldInput) {
    throw new Error(`No input found in field container: ${field}`);
  }
  await user.clear(fieldInput);
  await user.type(fieldInput, value.toString());
};

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
