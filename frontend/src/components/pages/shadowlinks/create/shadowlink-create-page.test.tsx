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
import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListShadowLinksResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';
import { listShadowLinks } from 'protogen/redpanda/api/console/v1alpha1/shadowlink-ShadowLinkService_connectquery';
import { FilterType, PatternType } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { toast } from 'sonner';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

import { ShadowLinkCreatePage } from './shadowlink-create-page';

// Mock the hooks
rs.mock('react-query/api/shadowlink', () => ({
  useCreateShadowLinkMutation: rs.fn(),
}));

// Mock config module
rs.mock('../../../../config', () => {
  const actual = rs.requireActual<typeof import('../../../../config')>('../../../../config');
  return {
    ...actual,
    isEmbedded: rs.fn(() => false),
  };
});

// Mock env module
rs.mock('../../../../utils/env', () => {
  const actual = rs.requireActual<typeof import('../../../../utils/env')>('../../../../utils/env');
  return {
    ...actual,
    getBasePath: rs.fn(() => '/console'),
  };
});

// Mock ui-state
rs.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

// Mock toast notifications
rs.mock('sonner', () => ({
  toast: {
    success: rs.fn(),
    error: rs.fn(),
  },
}));

import { useCreateShadowLinkMutation } from 'react-query/api/shadowlink';
import { useSupportedFeaturesStore } from 'state/supported-features';

import { isEmbedded } from '../../../../config';
import { getBasePath } from '../../../../utils/env';
import {
  addACLFilterCreate,
  addBootstrapServer,
  addConsumerFilterCreate,
  addRoleFilterCreate,
  addTopicFilterCreate,
  enableTLS,
  navigateToConfigurationStep,
  setSchemaRegistrySyncGateSupported as seedSchemaRegistrySyncGate,
  setShadowLinkGatesSupported,
} from '../shadowlink-test-helpers';

const pristineFeatureStoreState = useSupportedFeaturesStore.getState();
const resetSchemaRegistrySyncGate = () => {
  useSupportedFeaturesStore.setState(pristineFeatureStoreState, true);
};

/**
 * Render the create page with all necessary providers
 */
const renderCreatePage = () =>
  renderWithFileRoutes(<ShadowLinkCreatePage />, {
    transport: createRouterTransport(({ rpc }) => {
      rpc(listShadowLinks, () => create(ListShadowLinksResponseSchema, { shadowLinks: [] }));
    }),
  });

/**
 * Create form specific action types
 */
type CertificateType = 'ca' | 'clientCert' | 'clientKey';

type CreateAction =
  | { type: 'fillName'; value: string }
  | { type: 'fillBootstrapServer'; index: number; value: string }
  | { type: 'addBootstrapServer'; value: string }
  | { type: 'fillScramUsername'; value: string }
  | { type: 'fillScramPassword'; value: string }
  | { type: 'enableTLS' }
  | { type: 'addCertificateFilePath'; certType: CertificateType; filePath: string }
  | { type: 'addCertificatePEM'; certType: CertificateType; pemContent: string }
  | { type: 'navigateToConfiguration' }
  | { type: 'addTopicFilterCreate'; name: string; options?: { patternType?: PatternType; filterType?: FilterType } }
  | { type: 'addConsumerFilterCreate'; name: string }
  | { type: 'addACLFilterCreate'; principal: string }
  | { type: 'addRoleFilterCreate'; name: string }
  | { type: 'enableSchemaRegistrySync' };

/**
 * Set an input's value directly and let the async form validation settle
 */
const fillInputValue = async (input: HTMLElement, value: string) => {
  // Value-only — tests assert submitted payload shape, not keystroke behaviour.
  fireEvent.input(input, { target: { value } });
  // mode: 'onChange' kicks off the async zodResolver, which re-renders the
  // form fields once it settles. Await that settle so it lands inside act().
  await waitFor(() => {
    expect((input as HTMLInputElement).value).toBe(value);
  });
};

// Map certificate type to its file path input testId suffix
const CERTIFICATE_PATH_TEST_ID_SUFFIX: Record<CertificateType, string> = {
  ca: 'ca',
  clientCert: 'client-cert',
  clientKey: 'client-key',
};

/**
 * Expand the disclosure that owns this cert type. CA lives under the CA disclosure;
 * clientCert/clientKey live under the mTLS disclosure.
 */
const openCertificateDisclosure = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  certType: CertificateType
) => {
  const trigger = scr.getByTestId(certType === 'ca' ? 'tls-ca-disclosure-trigger' : 'tls-mtls-disclosure-trigger');
  if (trigger.getAttribute('data-state') !== 'open') {
    await user.click(trigger);
  }
};

const addCertificateFilePath = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  certType: CertificateType,
  filePath: string
) => {
  await openCertificateDisclosure(user, scr, certType);

  // The mode picker only renders once a disclosure is open. Switch to file path.
  await waitFor(
    () => {
      expect(scr.getByTestId('mtls-mode-file-path-tab')).toBeInTheDocument();
    },
    { timeout: 200 }
  );
  await user.click(scr.getByTestId('mtls-mode-file-path-tab'));

  const testIdSuffix = CERTIFICATE_PATH_TEST_ID_SUFFIX[certType];

  // Wait for the file path input to appear
  await waitFor(
    () => {
      expect(scr.getByTestId(`mtls-${testIdSuffix}-path-input`)).toBeInTheDocument();
    },
    { timeout: 200 }
  );
  await user.type(scr.getByTestId(`mtls-${testIdSuffix}-path-input`), filePath);
};

/**
 * Expand the disclosure that owns this cert type, then drop a file directly into
 * the inline upload row. No modal, no save step.
 */
const uploadCertificatePem = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  certType: CertificateType,
  pemContent: string
) => {
  await openCertificateDisclosure(user, scr, certType);

  await waitFor(
    () => {
      expect(scr.getByTestId(`add-${certType}-button`)).toBeInTheDocument();
    },
    { timeout: 200 }
  );

  const input = scr.getByTestId(`add-${certType}-button`).querySelector('input[type="file"]');
  const file = new File([pemContent], `${certType}.pem`, { type: 'application/x-pem-file' });

  if (input) {
    await user.upload(input as HTMLInputElement, file);
  }

  await waitFor(() => {
    expect(scr.getByTestId(`${certType}-status`)).toBeInTheDocument();
  });
};

/**
 * Perform action for create form
 */
const performCreateAction = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  action: CreateAction
): Promise<void> => {
  switch (action.type) {
    case 'fillName':
      await fillInputValue(scr.getByPlaceholderText('my-shadow-link'), action.value);
      break;
    case 'fillBootstrapServer':
      await fillInputValue(scr.getByTestId(`bootstrap-server-input-${action.index}`), action.value);
      break;
    case 'addBootstrapServer':
      await addBootstrapServer(user, scr, action.value);
      break;
    case 'fillScramUsername':
      await fillInputValue(scr.getByTestId('scram-username-input'), action.value);
      break;
    case 'fillScramPassword':
      await fillInputValue(scr.getByTestId('scram-password-input'), action.value);
      break;
    case 'enableTLS':
      await enableTLS(user, scr);
      break;
    case 'addCertificateFilePath':
      await addCertificateFilePath(user, scr, action.certType, action.filePath);
      break;
    case 'addCertificatePEM':
      await uploadCertificatePem(user, scr, action.certType, action.pemContent);
      break;
    case 'navigateToConfiguration':
      await navigateToConfigurationStep(user, scr);
      break;
    case 'addTopicFilterCreate':
      await addTopicFilterCreate(user, scr, action.name, action.options);
      break;
    case 'addConsumerFilterCreate':
      await addConsumerFilterCreate(user, scr, action.name);
      break;
    case 'addACLFilterCreate':
      await addACLFilterCreate(user, scr, action.principal);
      break;
    case 'addRoleFilterCreate':
      await addRoleFilterCreate(user, scr, action.name);
      break;
    case 'enableSchemaRegistrySync':
      await user.click(scr.getByTestId('sr-enable-switch'));
      break;
    default:
      throw new Error(`Unknown action type: ${JSON.stringify(action)}`);
  }
};

/**
 * Connection step values shared by most cases, ending on the configuration step
 */
const CONNECTION_STEP_ACTIONS: CreateAction[] = [
  { type: 'fillName', value: 'test-shadow-link' },
  { type: 'fillBootstrapServer', index: 0, value: 'server1.example.com:9092' },
  { type: 'fillScramUsername', value: 'admin' },
  { type: 'fillScramPassword', value: 'admin-secret' },
  { type: 'navigateToConfiguration' },
];

/**
 * Render the page, wait for the connection step, then run the actions in sequence
 */
const renderAndPerform = async (user: ReturnType<typeof userEvent.setup>, actions: CreateAction[]) => {
  renderCreatePage();

  // Wait for the form to load and the connection step to render
  await screen.findByPlaceholderText('my-shadow-link', {}, { timeout: 10_000 });

  // Each action drives the same form and may move to another step, so chain them in order.
  await actions.reduce<Promise<void>>(
    (previous, action) => previous.then(() => performCreateAction(user, screen, action)),
    Promise.resolve()
  );
};

/**
 * Submit the form and return the request passed to the create mutation
 */
const submitCreateForm = async (
  user: ReturnType<typeof userEvent.setup>,
  mockMutateAsync: ReturnType<typeof rs.fn>
) => {
  await user.click(screen.getByRole('button', { name: 'Create shadow link' }));

  // Verify mutateAsync was called
  await waitFor(
    () => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    },
    { timeout: 5000 }
  );

  return mockMutateAsync.mock.calls[0][0];
};

/**
 * The submit succeeds asynchronously: after mutateAsync resolves, the
 * onSuccess callback fires toast.success and navigate(). Those land as a
 * late RHF/router re-render of the still-mounted form fields. Await the
 * settled side effect so any final update is flushed inside act() before
 * the test ends.
 */
const waitForCreateSuccess = async () => {
  await waitFor(() => {
    expect(toast.success).toHaveBeenCalledWith('Shadow link created');
  });
};

/**
 * Switch Schema Registry sync to the API mode and fill its URL and HTTP Basic credentials
 */
const fillSchemaRegistryApiConnection = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByTestId('sr-mode-api-tab'));
  await waitFor(() => {
    expect(screen.getByTestId('sr-source-url-input')).toBeInTheDocument();
  });

  fireEvent.input(screen.getByTestId('sr-source-url-input'), {
    target: { value: 'https://schema-registry.example.com:8081' },
  });

  await user.click(screen.getByTestId('sr-auth-basic-tab'));
  await waitFor(() => {
    expect(screen.getByTestId('sr-basic-username-input')).toBeInTheDocument();
  });
  fireEvent.input(screen.getByTestId('sr-basic-username-input'), { target: { value: 'sr-replicator' } });
  fireEvent.input(screen.getByTestId('sr-basic-password-input'), { target: { value: 'p@ssw0rd!' } });
};

/**
 * Test case type definition for create form
 */
type CreateTestCase = {
  description: string;
  actions: CreateAction[];
  verify: (createRequest: any, exp: typeof import('@rstest/core').expect) => void;
};

/**
 * Test cases for table-driven testing
 */
const testCases: CreateTestCase[] = [
  {
    description: 'creates minimal shadow link with required fields only',
    actions: [
      { type: 'fillName', value: 'test-shadow-link' },
      { type: 'fillBootstrapServer', index: 0, value: 'server1.example.com:9092' },
      { type: 'fillScramUsername', value: 'admin' },
      { type: 'fillScramPassword', value: 'admin-secret' },
      { type: 'navigateToConfiguration' },
    ],
    verify: (createRequest, exp) => {
      exp(createRequest.shadowLink.name).toBe('test-shadow-link');
      exp(createRequest.shadowLink.configurations.clientOptions.bootstrapServers).toEqual(['server1.example.com:9092']);
      exp(createRequest.shadowLink.configurations.clientOptions.authenticationConfiguration.authentication.case).toBe(
        'scramConfiguration'
      );
      const scramConfig =
        createRequest.shadowLink.configurations.clientOptions.authenticationConfiguration.authentication.value;
      exp(scramConfig.username).toBe('admin');
      exp(scramConfig.password).toBe('admin-secret');
      exp(scramConfig.scramMechanism).toBeDefined();
      // Untouched roles default to all: a single wildcard include filter
      exp(createRequest.shadowLink.configurations.roleSyncOptions?.roleNameFilters).toEqual([
        exp.objectContaining({ name: '*', patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE }),
      ]);
    },
  },
  {
    description: 'creates shadow link with 2 bootstrap servers',
    actions: [
      { type: 'fillName', value: 'test-shadow-link' },
      { type: 'fillBootstrapServer', index: 0, value: 'server1.example.com:9092' },
      { type: 'addBootstrapServer', value: 'server2.example.com:9092' },
      { type: 'fillScramUsername', value: 'admin' },
      { type: 'fillScramPassword', value: 'admin-secret' },
      { type: 'navigateToConfiguration' },
    ],
    verify: (createRequest, exp) => {
      exp(createRequest.shadowLink.configurations.clientOptions.bootstrapServers).toEqual([
        'server1.example.com:9092',
        'server2.example.com:9092',
      ]);
    },
  },
  {
    description: 'creates shadow link with topic filters',
    actions: [
      { type: 'fillName', value: 'test-shadow-link' },
      { type: 'fillBootstrapServer', index: 0, value: 'server1.example.com:9092' },
      { type: 'fillScramUsername', value: 'admin' },
      { type: 'fillScramPassword', value: 'admin-secret' },
      { type: 'navigateToConfiguration' },
      {
        type: 'addTopicFilterCreate',
        name: 'topic-exact',
        options: { patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE },
      },
    ],
    verify: (createRequest, exp) => {
      exp(createRequest.shadowLink.configurations.topicMetadataSyncOptions?.autoCreateShadowTopicFilters).toHaveLength(
        1
      );
      const topicFilter =
        createRequest.shadowLink.configurations.topicMetadataSyncOptions?.autoCreateShadowTopicFilters[0];
      exp(topicFilter.name).toBe('topic-exact');
      exp(topicFilter.patternType).toBe(PatternType.LITERAL);
      exp(topicFilter.filterType).toBe(FilterType.INCLUDE);
    },
  },
  {
    description: 'creates shadow link with role filters',
    actions: [
      { type: 'fillName', value: 'test-shadow-link' },
      { type: 'fillBootstrapServer', index: 0, value: 'server1.example.com:9092' },
      { type: 'fillScramUsername', value: 'admin' },
      { type: 'fillScramPassword', value: 'admin-secret' },
      { type: 'navigateToConfiguration' },
      { type: 'addRoleFilterCreate', name: 'my-role' },
    ],
    verify: (createRequest, exp) => {
      exp(createRequest.shadowLink.configurations.roleSyncOptions?.roleNameFilters).toHaveLength(1);
      const roleFilter = createRequest.shadowLink.configurations.roleSyncOptions?.roleNameFilters[0];
      exp(roleFilter.name).toBe('my-role');
      exp(roleFilter.patternType).toBe(PatternType.LITERAL);
      exp(roleFilter.filterType).toBe(FilterType.INCLUDE);
    },
  },
  {
    description: 'creates shadow link with a specific ACL filter',
    actions: [
      { type: 'fillName', value: 'test-shadow-link' },
      { type: 'fillBootstrapServer', index: 0, value: 'server1.example.com:9092' },
      { type: 'fillScramUsername', value: 'admin' },
      { type: 'fillScramPassword', value: 'admin-secret' },
      { type: 'navigateToConfiguration' },
      { type: 'addACLFilterCreate', principal: 'User:alice' },
    ],
    verify: (createRequest, exp) => {
      // Specify mode must send the user's filter, not the match-all one
      exp(createRequest.shadowLink.configurations.securitySyncOptions?.aclFilters).toHaveLength(1);
      const aclFilter = createRequest.shadowLink.configurations.securitySyncOptions?.aclFilters[0];
      exp(aclFilter.accessFilter?.principal).toBe('User:alice');
    },
  },
  {
    description: 'creates shadow link with 2 servers and 1 topic filter',
    actions: [
      { type: 'fillName', value: 'test-shadow-link' },
      { type: 'fillBootstrapServer', index: 0, value: 'server1.example.com:9092' },
      { type: 'addBootstrapServer', value: 'server2.example.com:9092' },
      { type: 'fillScramUsername', value: 'admin' },
      { type: 'fillScramPassword', value: 'admin-secret' },
      { type: 'navigateToConfiguration' },
      {
        type: 'addTopicFilterCreate',
        name: 'topic-exact',
        options: { patternType: PatternType.LITERAL, filterType: FilterType.INCLUDE },
      },
    ],
    verify: (createRequest, exp) => {
      exp(createRequest.shadowLink.name).toBe('test-shadow-link');
      exp(createRequest.shadowLink.configurations.clientOptions.bootstrapServers).toEqual([
        'server1.example.com:9092',
        'server2.example.com:9092',
      ]);
      exp(createRequest.shadowLink.configurations.topicMetadataSyncOptions?.autoCreateShadowTopicFilters).toHaveLength(
        1
      );
      exp(createRequest.shadowLink.configurations.topicMetadataSyncOptions?.autoCreateShadowTopicFilters[0].name).toBe(
        'topic-exact'
      );
    },
  },
  {
    description: 'creates shadow link with TLS certificate using file path',
    actions: [
      { type: 'fillName', value: 'test-shadow-link' },
      { type: 'fillBootstrapServer', index: 0, value: 'server1.example.com:9092' },
      { type: 'fillScramUsername', value: 'admin' },
      { type: 'fillScramPassword', value: 'admin-secret' },
      { type: 'addCertificateFilePath', certType: 'ca', filePath: '/etc/certs/ca.pem' },
      { type: 'navigateToConfiguration' },
    ],
    verify: (createRequest, exp) => {
      exp(createRequest.shadowLink.name).toBe('test-shadow-link');
      exp(createRequest.shadowLink.configurations.clientOptions.tlsSettings.enabled).toBe(true);
      exp(createRequest.shadowLink.configurations.clientOptions.tlsSettings.tlsSettings.case).toBe('tlsFileSettings');
      exp(createRequest.shadowLink.configurations.clientOptions.tlsSettings.tlsSettings.value.caPath).toBe(
        '/etc/certs/ca.pem'
      );
    },
  },
  {
    description: 'creates shadow link with TLS certificate using PEM upload',
    actions: [
      { type: 'fillName', value: 'test-shadow-link' },
      { type: 'fillBootstrapServer', index: 0, value: 'server1.example.com:9092' },
      { type: 'fillScramUsername', value: 'admin' },
      { type: 'fillScramPassword', value: 'admin-secret' },
      {
        type: 'addCertificatePEM',
        certType: 'ca',
        pemContent: '-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----',
      },
      { type: 'navigateToConfiguration' },
    ],
    verify: (createRequest, exp) => {
      exp(createRequest.shadowLink.name).toBe('test-shadow-link');
      exp(createRequest.shadowLink.configurations.clientOptions.tlsSettings.enabled).toBe(true);
      exp(createRequest.shadowLink.configurations.clientOptions.tlsSettings.tlsSettings.case).toBe('tlsPemSettings');
      exp(createRequest.shadowLink.configurations.clientOptions.tlsSettings.tlsSettings.value.ca).toBe(
        '-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----'
      );
    },
  },
  {
    description: 'creates shadow link with schema registry sync enabled',
    actions: [
      { type: 'fillName', value: 'test-shadow-link' },
      { type: 'fillBootstrapServer', index: 0, value: 'server1.example.com:9092' },
      { type: 'fillScramUsername', value: 'admin' },
      { type: 'fillScramPassword', value: 'admin-secret' },
      { type: 'navigateToConfiguration' },
      { type: 'enableSchemaRegistrySync' },
    ],
    verify: (createRequest, exp) => {
      exp(createRequest.shadowLink.name).toBe('test-shadow-link');
      exp(createRequest.shadowLink.configurations.schemaRegistrySyncOptions).toBeDefined();
      exp(createRequest.shadowLink.configurations.schemaRegistrySyncOptions.schemaRegistryShadowingMode.case).toBe(
        'shadowSchemaRegistryTopic'
      );
    },
  },
];

describe('the ShadowLinkCreatePage', () => {
  const mockMutateAsync = rs.fn();

  beforeEach(() => {
    rs.clearAllMocks();

    // SR gate closed: these cases exercise the legacy Schema Registry switch.
    // Role gate open: the roles card and its default-all payload need >= 26.2.0.
    setShadowLinkGatesSupported({ schemaRegistrySync: false, roleSync: true });

    mockMutateAsync.mockImplementation((_request) => Promise.resolve({}));

    // Mock create mutation - must return the mutation hook properly
    rs.mocked(useCreateShadowLinkMutation).mockImplementation((options) => {
      // Wrap mutateAsync to call onSuccess callback
      const wrappedMutateAsync = async (request: any) => {
        const result = await mockMutateAsync(request);
        options?.onSuccess?.(result, request, undefined, {} as any);
        return result;
      };

      return {
        mutateAsync: wrappedMutateAsync,
        isPending: false,
        isError: false,
        isSuccess: false,
        error: null,
        data: undefined,
        mutate: rs.fn(),
        reset: rs.fn(),
        status: 'idle',
        variables: undefined,
        context: undefined,
        failureCount: 0,
        failureReason: null,
        isPaused: false,
        submittedAt: 0,
      } as any;
    });
  });

  afterEach(() => {
    resetSchemaRegistrySyncGate();
  });

  test.each(testCases)('$description', async ({ actions, verify }) => {
    const user = userEvent.setup();

    await renderAndPerform(user, actions);

    const createRequest = await submitCreateForm(user, mockMutateAsync);

    // Run custom verification function
    verify(createRequest, expect);

    await waitForCreateSuccess();
  });

  test('hides the roles card and omits role sync options when the cluster does not support role sync', async () => {
    setShadowLinkGatesSupported({ schemaRegistrySync: false, roleSync: false });

    const user = userEvent.setup();

    await renderAndPerform(user, CONNECTION_STEP_ACTIONS);

    // The whole roles card is gated out
    expect(screen.queryByTestId('roles-all-tab')).not.toBeInTheDocument();
    expect(screen.queryByTestId('roles-toggle-button')).not.toBeInTheDocument();

    // Not even the default include-all filter may be sent to a cluster
    // that predates role sync
    const createRequest = await submitCreateForm(user, mockMutateAsync);
    expect(createRequest.shadowLink.configurations.roleSyncOptions).toBeUndefined();

    await waitForCreateSuccess();
  });
});

describe('the ShadowLinkCreatePage - Schema Registry sync over API', () => {
  const mockMutateAsync = rs.fn();

  beforeEach(() => {
    rs.clearAllMocks();

    // Gate open: the redesigned Schema Registry section renders.
    seedSchemaRegistrySyncGate(true);

    mockMutateAsync.mockImplementation((_request) => Promise.resolve({}));

    rs.mocked(useCreateShadowLinkMutation).mockImplementation((options) => {
      const wrappedMutateAsync = async (request: any) => {
        const result = await mockMutateAsync(request);
        options?.onSuccess?.(result, request, undefined, {} as any);
        return result;
      };

      return {
        mutateAsync: wrappedMutateAsync,
        isPending: false,
        isError: false,
        isSuccess: false,
        error: null,
        data: undefined,
        mutate: rs.fn(),
        reset: rs.fn(),
        status: 'idle',
        variables: undefined,
        context: undefined,
        failureCount: 0,
        failureReason: null,
        isPaused: false,
        submittedAt: 0,
      } as any;
    });
  });

  afterEach(() => {
    resetSchemaRegistrySyncGate();
  });

  test('submits api mode with raw basic auth password and TLS enabled', async () => {
    const user = userEvent.setup();

    await renderAndPerform(user, CONNECTION_STEP_ACTIONS);

    // The redesigned section replaces the legacy switch
    expect(screen.queryByTestId('sr-enable-switch')).not.toBeInTheDocument();

    await fillSchemaRegistryApiConnection(user);

    const createRequest = await submitCreateForm(user, mockMutateAsync);
    expect(createRequest.shadowLink.configurations.schemaRegistrySyncOptions.schemaRegistryShadowingMode).toMatchObject(
      {
        case: 'shadowSchemaRegistryApi',
        value: {
          sourceUrl: 'https://schema-registry.example.com:8081',
          authOptions: {
            authOptions: {
              case: 'basic',
              // Raw password, never a secret reference
              value: { username: 'sr-replicator', password: 'p@ssw0rd!' },
            },
          },
          tlsSettings: { enabled: true },
        },
      }
    );

    await waitForCreateSuccess();
  });

  test('keeps the legacy topic payload when _schemas topic mode is selected', async () => {
    const user = userEvent.setup();

    await renderAndPerform(user, CONNECTION_STEP_ACTIONS);

    await user.click(screen.getByTestId('sr-mode-topic-tab'));

    const createRequest = await submitCreateForm(user, mockMutateAsync);
    expect(createRequest.shadowLink.configurations.schemaRegistrySyncOptions.schemaRegistryShadowingMode.case).toBe(
      'shadowSchemaRegistryTopic'
    );

    await waitForCreateSuccess();
  });
});

describe('the ShadowLinkCreatePage - Embedded Mode Redirect', () => {
  const mockMutateAsync = rs.fn();
  const originalLocation = window.location;

  beforeEach(() => {
    rs.clearAllMocks();
    mockMutateAsync.mockImplementation(() => Promise.resolve({}));

    rs.mocked(useCreateShadowLinkMutation).mockImplementation((options) => {
      const wrappedMutateAsync = async (request: any) => {
        const result = await mockMutateAsync(request);
        options?.onSuccess?.(result, request, undefined, {} as any);
        return result;
      };

      return {
        mutateAsync: wrappedMutateAsync,
        isPending: false,
        isError: false,
        isSuccess: false,
        error: null,
        data: undefined,
        mutate: rs.fn(),
        reset: rs.fn(),
        status: 'idle',
        variables: undefined,
        context: undefined,
        failureCount: 0,
        failureReason: null,
        isPaused: false,
        submittedAt: 0,
      } as any;
    });

    // Mock window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: '', pathname: '/clusters/abc/shadowlinks/create' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  test('redirects to correct path when in embedded mode', async () => {
    // happy-dom blocks `window.location.href` assignment when
    // disableMainFrameNavigation is on (see rstest.setup.ts), so
    // replace window.location with a plain object whose href we can inspect.
    const originalLocation = window.location;
    const locationStub = { href: '' };
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: locationStub,
    });

    rs.mocked(isEmbedded).mockReturnValue(true);
    rs.mocked(getBasePath).mockReturnValue('/console');

    try {
      renderWithFileRoutes(<ShadowLinkCreatePage />);

      await waitFor(() => {
        expect(locationStub.href).toBe('/console/shadowlinks/create');
      });
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: originalLocation,
      });
    }
  });

  test('does not redirect when not in embedded mode', async () => {
    rs.mocked(isEmbedded).mockReturnValue(false);

    renderWithFileRoutes(<ShadowLinkCreatePage />);

    await waitFor(() => {
      expect(screen.getByTestId('shadowLink-create-page-description')).toBeInTheDocument();
    });

    expect(window.location.href).toBe('');
  });
});
