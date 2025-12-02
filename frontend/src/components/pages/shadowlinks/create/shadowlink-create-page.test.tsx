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

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterType, PatternType } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { ShadowLinkCreatePage } from './shadowlink-create-page';

// Mock the hooks
vi.mock('react-query/api/shadowlink', () => ({
  useCreateShadowLinkMutation: vi.fn(),
}));

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

// Mock react-router navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { useCreateShadowLinkMutation } from 'react-query/api/shadowlink';
import { render } from 'test-utils';

import {
  addACLFilterCreate,
  addBootstrapServer,
  addConsumerFilterCreate,
  addTopicFilterCreate,
  enableTLS,
  navigateToConfigurationStep,
} from '../shadowlink-test-helpers';

/**
 * Render the create page with all necessary providers
 */
const renderCreatePage = () =>
  render(
    <MemoryRouter initialEntries={['/shadowlinks/create']}>
      <Routes>
        <Route element={<ShadowLinkCreatePage />} path="/shadowlinks/create" />
      </Routes>
    </MemoryRouter>
  );

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
  | { type: 'addACLFilterCreate'; principal: string };

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
      await user.type(nameInput, action.value);
      break;
    }
    case 'fillBootstrapServer': {
      const serverInput = scr.getByTestId(`bootstrap-server-input-${action.index}`);
      await user.clear(serverInput);
      await user.type(serverInput, action.value);
      break;
    }
    case 'addBootstrapServer':
      await addBootstrapServer(user, scr, action.value);
      break;
    case 'fillScramUsername': {
      const usernameInput = scr.getByTestId('scram-username-input');
      await user.type(usernameInput, action.value);
      break;
    }
    case 'fillScramPassword': {
      const passwordInput = scr.getByTestId('scram-password-input');
      await user.type(passwordInput, action.value);
      break;
    }
    case 'enableTLS':
      await enableTLS(user, scr);
      break;
    case 'addCertificateFilePath': {
      // First, switch to file path mode
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
      await waitFor(
        () => {
          expect(scr.getByTestId(`add-${action.certType}-button`)).toBeInTheDocument();
        },
        { timeout: 200 }
      );

      const addButton = scr.getByTestId(`add-${action.certType}-button`);
      await user.click(addButton);

      await waitFor(
        () => {
          const dropzone = scr.getByTestId('certificate-dropzone');
          expect(dropzone).toBeVisible();
        },
        { timeout: 200 }
      );

      const file = new File([action.pemContent], `${action.certType}.pem`, { type: 'application/x-pem-file' });
      const dropzone = scr.getByTestId('certificate-dropzone');
      const input = dropzone.querySelector('input[type="file"]');

      if (input) {
        await user.upload(input as HTMLInputElement, file);
      }

      await waitFor(() => {
        const saveButton = scr.getByTestId('save-certificate-button');
        expect(saveButton).not.toBeDisabled();
      });

      const saveButton = scr.getByTestId('save-certificate-button');
      await user.click(saveButton);

      await waitFor(() => {
        expect(scr.queryByTestId(`certificate-dialog-${action.certType}`)).not.toBeInTheDocument();
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
];

describe('ShadowLinkCreatePage', () => {
  const mockMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockMutateAsync.mockImplementation((_request) => Promise.resolve({}));

    // Mock create mutation - must return the mutation hook properly
    vi.mocked(useCreateShadowLinkMutation).mockImplementation((options) => {
      // Wrap mutateAsync to call onSuccess callback
      const wrappedMutateAsync = async (request: any) => {
        const result = await mockMutateAsync(request);
        options?.onSuccess?.(result, request, undefined);
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

    // Verify navigation to shadowlinks list after success
    expect(mockNavigate).toHaveBeenCalledWith('/shadowlinks');
  });
});
