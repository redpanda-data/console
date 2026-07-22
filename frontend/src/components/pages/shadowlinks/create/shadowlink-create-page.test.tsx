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

import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterType, PatternType } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { toast } from 'sonner';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { ShadowLinkCreatePage } from './shadowlink-create-page';

// Mock the hooks
vi.mock('react-query/api/shadowlink', () => ({
  useCreateShadowLinkMutation: vi.fn(),
}));

// Mock config module
vi.mock('../../../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../config')>();
  return {
    ...actual,
    isEmbedded: vi.fn(() => false),
  };
});

// Mock env module
vi.mock('../../../../utils/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../utils/env')>();
  return {
    ...actual,
    getBasePath: vi.fn(() => '/console'),
  };
});

// Mock hookform devtools
vi.mock('@hookform/devtools', () => ({
  DevTool: () => null,
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

import { useCreateShadowLinkMutation } from 'react-query/api/shadowlink';
import { useSupportedFeaturesStore } from 'state/supported-features';

import { isEmbedded } from '../../../../config';
import { getBasePath } from '../../../../utils/env';
import {
  addACLFilterCreate,
  addBootstrapServer,
  addConsumerFilterCreate,
  addTopicFilterCreate,
  enableTLS,
  navigateToConfigurationStep,
  setSchemaRegistrySyncGateSupported as seedSchemaRegistrySyncGate,
} from '../shadowlink-test-helpers';

const pristineFeatureStoreState = useSupportedFeaturesStore.getState();
const resetSchemaRegistrySyncGate = () => {
  useSupportedFeaturesStore.setState(pristineFeatureStoreState, true);
};

/**
 * Render the create page with all necessary providers
 */
const renderCreatePage = () => renderWithFileRoutes(<ShadowLinkCreatePage />);

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
  | { type: 'enableSchemaRegistrySync' };

/**
 * Perform action for create form
 */
const performCreateAction = async (
  user: ReturnType<typeof userEvent.setup>,
  scr: typeof import('@testing-library/react').screen,
  action: CreateAction
): Promise<void> => {
  switch (action.type) {
    case 'fillName': {
      const nameInput = scr.getByPlaceholderText('my-shadow-link');
      // Value-only — tests assert submitted payload shape, not keystroke behaviour.
      fireEvent.input(nameInput, { target: { value: action.value } });
      // mode: 'onChange' kicks off the async zodResolver, which re-renders the
      // form fields once it settles. Await that settle so it lands inside act().
      await waitFor(() => {
        expect((nameInput as HTMLInputElement).value).toBe(action.value);
      });
      break;
    }
    case 'fillBootstrapServer': {
      const serverInput = scr.getByTestId(`bootstrap-server-input-${action.index}`);
      fireEvent.input(serverInput, { target: { value: action.value } });
      await waitFor(() => {
        expect((serverInput as HTMLInputElement).value).toBe(action.value);
      });
      break;
    }
    case 'addBootstrapServer':
      await addBootstrapServer(user, scr, action.value);
      break;
    case 'fillScramUsername': {
      const usernameInput = scr.getByTestId('scram-username-input');
      fireEvent.input(usernameInput, { target: { value: action.value } });
      await waitFor(() => {
        expect((usernameInput as HTMLInputElement).value).toBe(action.value);
      });
      break;
    }
    case 'fillScramPassword': {
      const passwordInput = scr.getByTestId('scram-password-input');
      fireEvent.input(passwordInput, { target: { value: action.value } });
      await waitFor(() => {
        expect((passwordInput as HTMLInputElement).value).toBe(action.value);
      });
      break;
    }
    case 'enableTLS':
      await enableTLS(user, scr);
      break;
    case 'addCertificateFilePath': {
      // Expand the disclosure that owns this cert type. CA lives under the CA disclosure;
      // clientCert/clientKey live under the mTLS disclosure.
      const triggerTestId = action.certType === 'ca' ? 'tls-ca-disclosure-trigger' : 'tls-mtls-disclosure-trigger';
      const trigger = scr.getByTestId(triggerTestId);
      if (trigger.getAttribute('data-state') !== 'open') {
        await user.click(trigger);
      }

      // The mode picker only renders once a disclosure is open. Switch to file path.
      await waitFor(
        () => {
          expect(scr.getByTestId('mtls-mode-file-path-tab')).toBeInTheDocument();
        },
        { timeout: 200 }
      );

      const filePathTab = scr.getByTestId('mtls-mode-file-path-tab');
      await user.click(filePathTab);

      // Map certificate type to testId suffix
      let testIdSuffix = 'client-key';
      if (action.certType === 'ca') {
        testIdSuffix = 'ca';
      } else if (action.certType === 'clientCert') {
        testIdSuffix = 'client-cert';
      }

      // Wait for the file path input to appear
      await waitFor(
        () => {
          expect(scr.getByTestId(`mtls-${testIdSuffix}-path-input`)).toBeInTheDocument();
        },
        { timeout: 200 }
      );

      const filePathInput = scr.getByTestId(`mtls-${testIdSuffix}-path-input`);
      await user.type(filePathInput, action.filePath);

      break;
    }
    case 'addCertificatePEM': {
      // Expand the disclosure that owns this cert type, then drop a file directly into
      // the inline Dropzone. No modal, no save step.
      const pemTriggerTestId = action.certType === 'ca' ? 'tls-ca-disclosure-trigger' : 'tls-mtls-disclosure-trigger';
      const pemTrigger = scr.getByTestId(pemTriggerTestId);
      if (pemTrigger.getAttribute('data-state') !== 'open') {
        await user.click(pemTrigger);
      }

      await waitFor(
        () => {
          expect(scr.getByTestId(`add-${action.certType}-button`)).toBeInTheDocument();
        },
        { timeout: 200 }
      );

      const dropzone = scr.getByTestId(`add-${action.certType}-button`);
      const input = dropzone.querySelector('input[type="file"]');
      const file = new File([action.pemContent], `${action.certType}.pem`, { type: 'application/x-pem-file' });

      if (input) {
        await user.upload(input as HTMLInputElement, file);
      }

      await waitFor(() => {
        expect(scr.getByTestId(`${action.certType}-status`)).toBeInTheDocument();
      });
      break;
    }
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
    case 'enableSchemaRegistrySync': {
      const schemaRegistrySwitch = scr.getByTestId('sr-enable-switch');
      await user.click(schemaRegistrySwitch);
      break;
    }
    default:
      throw new Error(`Unknown action type: ${JSON.stringify(action)}`);
  }
};

/**
 * Test case type definition for create form
 */
type CreateTestCase = {
  description: string;
  actions: CreateAction[];
  verify: (createRequest: any, exp: typeof import('vitest').expect) => void;
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

describe('ShadowLinkCreatePage', () => {
  const mockMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Gate closed: these cases exercise the legacy Schema Registry switch.
    seedSchemaRegistrySyncGate(false);

    mockMutateAsync.mockImplementation((_request) => Promise.resolve({}));

    // Mock create mutation - must return the mutation hook properly
    vi.mocked(useCreateShadowLinkMutation).mockImplementation((options) => {
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
        mutate: vi.fn(),
        reset: vi.fn(),
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

    renderCreatePage();

    // Wait for the form to load and the connection step to render
    await screen.findByPlaceholderText('my-shadow-link', {}, { timeout: 10_000 });

    // Execute all actions in sequence
    for (const action of actions) {
      await performCreateAction(user, screen, action);
    }

    // Submit the form
    const createButton = screen.getByRole('button', { name: 'Create shadow link' });
    await user.click(createButton);

    // Verify mutateAsync was called
    await waitFor(
      () => {
        expect(mockMutateAsync).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000 }
    );

    const createRequest = mockMutateAsync.mock.calls[0][0];

    // Run custom verification function
    verify(createRequest, expect);

    // The submit succeeds asynchronously: after mutateAsync resolves, the
    // onSuccess callback fires toast.success and navigate(). Those land as a
    // late RHF/router re-render of the still-mounted form fields. Await the
    // settled side effect so any final update is flushed inside act() before
    // the test ends.
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Shadow link created');
    });
  });
});

describe('ShadowLinkCreatePage - Schema Registry sync over API', () => {
  const mockMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Gate open: the redesigned Schema Registry section renders.
    seedSchemaRegistrySyncGate(true);

    mockMutateAsync.mockImplementation((_request) => Promise.resolve({}));

    vi.mocked(useCreateShadowLinkMutation).mockImplementation((options) => {
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
        mutate: vi.fn(),
        reset: vi.fn(),
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

    renderCreatePage();

    await screen.findByPlaceholderText('my-shadow-link', {}, { timeout: 10_000 });

    await performCreateAction(user, screen, { type: 'fillName', value: 'test-shadow-link' });
    await performCreateAction(user, screen, {
      type: 'fillBootstrapServer',
      index: 0,
      value: 'server1.example.com:9092',
    });
    await performCreateAction(user, screen, { type: 'fillScramUsername', value: 'admin' });
    await performCreateAction(user, screen, { type: 'fillScramPassword', value: 'admin-secret' });
    await performCreateAction(user, screen, { type: 'navigateToConfiguration' });

    // The redesigned section replaces the legacy switch
    expect(screen.queryByTestId('sr-enable-switch')).not.toBeInTheDocument();

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

    const createButton = screen.getByRole('button', { name: 'Create shadow link' });
    await user.click(createButton);

    await waitFor(
      () => {
        expect(mockMutateAsync).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000 }
    );

    const createRequest = mockMutateAsync.mock.calls[0][0];
    const syncOptions = createRequest.shadowLink.configurations.schemaRegistrySyncOptions;
    expect(syncOptions.schemaRegistryShadowingMode.case).toBe('shadowSchemaRegistryApi');

    const apiOptions = syncOptions.schemaRegistryShadowingMode.value;
    expect(apiOptions.sourceUrl).toBe('https://schema-registry.example.com:8081');
    expect(apiOptions.authOptions.authOptions.case).toBe('basic');
    expect(apiOptions.authOptions.authOptions.value.username).toBe('sr-replicator');
    // Raw password, never a secret reference
    expect(apiOptions.authOptions.authOptions.value.password).toBe('p@ssw0rd!');
    expect(apiOptions.tlsSettings.enabled).toBe(true);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Shadow link created');
    });
  });

  test('keeps the legacy topic payload when _schemas topic mode is selected', async () => {
    const user = userEvent.setup();

    renderCreatePage();

    await screen.findByPlaceholderText('my-shadow-link', {}, { timeout: 10_000 });

    await performCreateAction(user, screen, { type: 'fillName', value: 'test-shadow-link' });
    await performCreateAction(user, screen, {
      type: 'fillBootstrapServer',
      index: 0,
      value: 'server1.example.com:9092',
    });
    await performCreateAction(user, screen, { type: 'fillScramUsername', value: 'admin' });
    await performCreateAction(user, screen, { type: 'fillScramPassword', value: 'admin-secret' });
    await performCreateAction(user, screen, { type: 'navigateToConfiguration' });

    await user.click(screen.getByTestId('sr-mode-topic-tab'));

    const createButton = screen.getByRole('button', { name: 'Create shadow link' });
    await user.click(createButton);

    await waitFor(
      () => {
        expect(mockMutateAsync).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000 }
    );

    const createRequest = mockMutateAsync.mock.calls[0][0];
    expect(createRequest.shadowLink.configurations.schemaRegistrySyncOptions.schemaRegistryShadowingMode.case).toBe(
      'shadowSchemaRegistryTopic'
    );

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Shadow link created');
    });
  });
});

describe('ShadowLinkCreatePage - Embedded Mode Redirect', () => {
  const mockMutateAsync = vi.fn();
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockImplementation(() => Promise.resolve({}));

    vi.mocked(useCreateShadowLinkMutation).mockImplementation((options) => {
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
        mutate: vi.fn(),
        reset: vi.fn(),
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
    // disableMainFrameNavigation is on (see vitest.setup.integration.ts), so
    // replace window.location with a plain object whose href we can inspect.
    const originalLocation = window.location;
    const locationStub = { href: '' };
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: locationStub,
    });

    vi.mocked(isEmbedded).mockReturnValue(true);
    vi.mocked(getBasePath).mockReturnValue('/console');

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
    vi.mocked(isEmbedded).mockReturnValue(false);

    renderWithFileRoutes(<ShadowLinkCreatePage />);

    await waitFor(() => {
      expect(screen.getByTestId('shadowLink-create-page-description')).toBeInTheDocument();
    });

    expect(window.location.href).toBe('');
  });
});
