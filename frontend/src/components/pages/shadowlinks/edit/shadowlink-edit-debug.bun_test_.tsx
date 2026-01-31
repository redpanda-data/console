/**
 * Debug test to verify mock behavior in Bun
 */
import { describe, expect, mock, test } from 'bun:test';

// Set up module mocks BEFORE importing anything that uses them
mock.module('config', () => ({
  config: { jwt: 'test', controlplaneUrl: 'http://localhost' },
  isFeatureFlagEnabled: () => false,
  addBearerTokenInterceptor: (next: (r: unknown) => Promise<unknown>) => next,
  checkExpiredLicenseInterceptor: (next: (r: unknown) => Promise<unknown>) => next,
  isEmbedded: () => false,
  isServerless: () => false,
  getGrpcBasePath: () => '',
  getControlplaneBasePath: () => '',
  setMonacoTheme: () => {},
  embeddedAvailableRoutesObservable: { value: [] },
  setup: () => {},
}));

mock.module('state/ui-state', () => ({
  uiState: { pageTitle: '', pageBreadcrumbs: [] },
}));

mock.module('sonner', () => ({
  toast: { success: mock(() => {}), error: mock(() => {}) },
}));

// Create mock for useEditShadowLink
const mockUpdateShadowLink = mock(() => {
  console.log('mockUpdateShadowLink called!');
  return Promise.resolve({});
});

const mockUseEditShadowLink = mock(() => {
  console.log('mockUseEditShadowLink called!');
  return {
    formValues: null,
    isLoading: false,
    error: null,
    isUpdating: false,
    hasData: false,
    updateShadowLink: mockUpdateShadowLink,
    dataplaneUpdate: { isPending: false, isSuccess: false, isError: false, error: null, reset: mock(() => {}) },
    controlplaneUpdate: { isPending: false, isSuccess: false, isError: false, error: null, reset: mock(() => {}) },
  };
});

mock.module('react-query/api/shadowlink', () => ({
  useEditShadowLink: mockUseEditShadowLink,
}));

const SHADOW_LINK_NAME = 'test-shadow-link';

mock.module('@tanstack/react-router', () => ({
  useParams: () => ({ name: SHADOW_LINK_NAME }),
  useNavigate: () => mock(() => {}),
  useRouter: () => ({ navigate: mock(() => {}) }),
  useRouterState: () => ({ location: { pathname: '/' } }),
  useMatch: () => ({}),
  useMatches: () => [],
  Link: ({ children }: { children: React.ReactNode }) => children,
  Outlet: () => null,
  RouterContextProvider: ({ children }: { children: React.ReactNode }) => children,
  createMemoryHistory: () => ({ initialEntries: ['/'] }),
  createRouter: () => ({}),
}));

// Now import everything else
import { create } from '@bufbuild/protobuf';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ShadowLink, ShadowLinkSchema } from 'protogen/redpanda/api/dataplane/v1/shadowlink_pb';
import {
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
import { renderWithFileRoutes, waitFor } from 'test-utils';

import { ShadowLinkEditPage } from './shadowlink-edit-page';
import { buildDefaultFormValues } from '../mappers/dataplane';

// DOM mocks
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView = mock(() => {});

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

describe('ShadowLink Edit Debug', () => {
  test('verify mock is called when form is submitted', async () => {
    const user = userEvent.setup();
    const mockShadowLink = createMockShadowLink();
    const formValues = buildDefaultFormValues(mockShadowLink);

    console.log('Setting up mock return value...');
    mockUpdateShadowLink.mockClear();
    mockUseEditShadowLink.mockClear();

    // Configure mock for this test with valid form values
    mockUseEditShadowLink.mockReturnValue({
      formValues,
      isLoading: false,
      error: null,
      isUpdating: false,
      hasData: true,
      updateShadowLink: mockUpdateShadowLink,
      dataplaneUpdate: { isPending: false, isSuccess: false, isError: false, error: null, reset: mock(() => {}) },
      controlplaneUpdate: { isPending: false, isSuccess: false, isError: false, error: null, reset: mock(() => {}) },
    });

    console.log('Rendering component...');
    const { getByText, findByTestId, queryByTestId } = renderWithFileRoutes(<ShadowLinkEditPage />);

    // Wait for the form to load
    await waitFor(() => {
      expect(getByText('Edit shadow link')).toBeInTheDocument();
    });
    console.log('Form loaded');

    // Wait for bootstrap server input (source tab content)
    await findByTestId('bootstrap-server-input-0', {}, { timeout: 5000 });
    console.log('Source tab content loaded');

    // Check number of mock calls
    console.log('mockUseEditShadowLink calls before submit:', mockUseEditShadowLink.mock.calls.length);
    console.log('mockUpdateShadowLink calls before submit:', mockUpdateShadowLink.mock.calls.length);

    // Find and click Save button
    const saveButton = getByText('Save');
    console.log('Clicking Save button...');
    await user.click(saveButton);

    // Check for validation errors - look for toast or error state
    const validationToast = queryByTestId('validation-error-toast');
    if (validationToast) {
      console.log('VALIDATION ERROR TOAST FOUND:', validationToast.textContent);
    }

    // Wait a bit and check
    await waitFor(
      () => {
        console.log('mockUpdateShadowLink calls after submit:', mockUpdateShadowLink.mock.calls.length);
        expect(mockUpdateShadowLink).toHaveBeenCalled();
      },
      { timeout: 5000 }
    );

    expect(mockUpdateShadowLink).toHaveBeenCalledTimes(1);
  });

  test('verify form state after render', async () => {
    const mockShadowLink = createMockShadowLink();
    const formValues = buildDefaultFormValues(mockShadowLink);

    console.log('formValues:', JSON.stringify(formValues, null, 2));

    mockUseEditShadowLink.mockClear();
    mockUseEditShadowLink.mockReturnValue({
      formValues,
      isLoading: false,
      error: null,
      isUpdating: false,
      hasData: true,
      updateShadowLink: mockUpdateShadowLink,
      dataplaneUpdate: { isPending: false, isSuccess: false, isError: false, error: null, reset: mock(() => {}) },
      controlplaneUpdate: { isPending: false, isSuccess: false, isError: false, error: null, reset: mock(() => {}) },
    });

    const { getByText, findByTestId, container } = renderWithFileRoutes(<ShadowLinkEditPage />);

    await waitFor(() => {
      expect(getByText('Edit shadow link')).toBeInTheDocument();
    });

    await findByTestId('bootstrap-server-input-0', {}, { timeout: 5000 });

    // Check form state
    const form = container.querySelector('form');
    if (form) {
      console.log('Form exists');

      // Try to find and inspect the form state
      const inputs = form.querySelectorAll('input');
      console.log('Number of inputs:', inputs.length);

      for (const input of Array.from(inputs).slice(0, 5)) {
        console.log('Input:', input.name || input.id || 'unnamed', '=', input.value);
      }
    }

    expect(getByText('Save')).toBeInTheDocument();
  });

  test('test with addTopicFilter action', async () => {
    const user = userEvent.setup();
    const mockShadowLink = createMockShadowLink();
    const formValues = buildDefaultFormValues(mockShadowLink);

    mockUpdateShadowLink.mockClear();
    mockUseEditShadowLink.mockClear();
    mockUseEditShadowLink.mockReturnValue({
      formValues,
      isLoading: false,
      error: null,
      isUpdating: false,
      hasData: true,
      updateShadowLink: mockUpdateShadowLink,
      dataplaneUpdate: { isPending: false, isSuccess: false, isError: false, error: null, reset: mock(() => {}) },
      controlplaneUpdate: { isPending: false, isSuccess: false, isError: false, error: null, reset: mock(() => {}) },
    });

    const { getByText, findByTestId, getByTestId, queryByTestId } = renderWithFileRoutes(<ShadowLinkEditPage />);

    await waitFor(() => {
      expect(getByText('Edit shadow link')).toBeInTheDocument();
    });
    await findByTestId('bootstrap-server-input-0', {}, { timeout: 5000 });
    console.log('Form loaded, starting addTopicFilter...');

    // Navigate to Shadowing tab
    const shadowingTab = getByTestId('tab-shadowing');
    console.log('Found shadowing tab, clicking...');
    await user.click(shadowingTab);

    // Wait for topics toggle button
    await waitFor(
      () => {
        expect(getByTestId('topics-toggle-button')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
    console.log('Topics toggle visible');

    // Expand topics section
    const topicsToggle = getByTestId('topics-toggle-button');
    await user.click(topicsToggle);
    console.log('Clicked topics toggle');

    // Wait for specify tab
    await waitFor(
      () => {
        expect(getByTestId('topics-specify-tab')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
    console.log('Topics specify tab visible');

    // Switch to specify mode
    const topicsSpecifyTab = getByTestId('topics-specify-tab');
    await user.click(topicsSpecifyTab);
    console.log('Clicked topics specify tab');

    // Wait for add button
    await waitFor(
      () => {
        expect(getByTestId('add-topic-filter-button')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
    console.log('Add topic filter button visible');

    // Wait for the first empty filter input
    await waitFor(
      () => {
        expect(getByTestId('topic-filter-0-name')).toBeInTheDocument();
      },
      { timeout: 5000 }
    );
    console.log('Topic filter input visible');

    // Fill the topic filter
    const topicInput = getByTestId('topic-filter-0-name');
    fireEvent.change(topicInput, { target: { value: 'my-test-topic' } });
    console.log('Filled topic filter with my-test-topic');

    // Now click Save
    const saveButton = getByText('Save');
    console.log('Clicking Save...');
    await user.click(saveButton);

    // Wait a moment for form submission to process
    await waitFor(
      () => {
        // Check for validation errors in DOM
        const validationErrors = document.querySelectorAll('[data-testid*="error"], [class*="error"], [role="alert"]');
        console.log('Found validation error elements:', validationErrors.length);
        for (const el of validationErrors) {
          console.log('  Error element:', el.textContent?.slice(0, 100));
        }

        // Check if mock was called
        const wasCalled = mockUpdateShadowLink.mock.calls.length > 0;
        console.log('mockUpdateShadowLink called:', wasCalled);

        if (!wasCalled) {
          // Debug: print form element content
          const form = document.querySelector('form');
          const invalidInputs = form?.querySelectorAll(':invalid');
          console.log('Invalid inputs count:', invalidInputs?.length);
          for (const input of Array.from(invalidInputs || [])) {
            console.log('  Invalid:', (input as HTMLInputElement).name, (input as HTMLInputElement).validationMessage);
          }
        }

        return wasCalled;
      },
      { timeout: 2000, interval: 500 }
    );

    expect(mockUpdateShadowLink).toHaveBeenCalledTimes(1);
    console.log('Test passed!');
  });

  test('test simpler: just add bootstrap server (like first passing test)', async () => {
    const user = userEvent.setup();
    const mockShadowLink = createMockShadowLink();
    const formValues = buildDefaultFormValues(mockShadowLink);

    mockUpdateShadowLink.mockClear();
    mockUseEditShadowLink.mockClear();
    mockUseEditShadowLink.mockReturnValue({
      formValues,
      isLoading: false,
      error: null,
      isUpdating: false,
      hasData: true,
      updateShadowLink: mockUpdateShadowLink,
      dataplaneUpdate: { isPending: false, isSuccess: false, isError: false, error: null, reset: mock(() => {}) },
      controlplaneUpdate: { isPending: false, isSuccess: false, isError: false, error: null, reset: mock(() => {}) },
    });

    const { getByText, findByTestId, getByTestId, getAllByTestId } = renderWithFileRoutes(<ShadowLinkEditPage />);

    await waitFor(() => {
      expect(getByText('Edit shadow link')).toBeInTheDocument();
    });
    await findByTestId('bootstrap-server-input-0', {}, { timeout: 5000 });
    console.log('Form loaded');

    // Add bootstrap server (this is what the first passing test does)
    const addButton = getByTestId('add-bootstrap-server-button');
    await user.click(addButton);
    console.log('Clicked add button');

    const inputs = getAllByTestId(/bootstrap-server-input-\d+/);
    console.log('Number of bootstrap inputs:', inputs.length);
    const newInput = inputs.at(-1);
    if (newInput) {
      fireEvent.change(newInput, { target: { value: 'localhost:9093' } });
      console.log('Filled new bootstrap server');
    }

    // Click Save
    const saveButton = getByText('Save');
    await user.click(saveButton);
    console.log('Clicked Save');

    await waitFor(
      () => {
        console.log('mockUpdateShadowLink calls:', mockUpdateShadowLink.mock.calls.length);
        expect(mockUpdateShadowLink).toHaveBeenCalled();
      },
      { timeout: 2000 }
    );

    expect(mockUpdateShadowLink).toHaveBeenCalledTimes(1);
    console.log('Bootstrap server test passed!');
  });
});
