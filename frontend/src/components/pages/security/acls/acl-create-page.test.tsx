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

import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

// Mock getRouteApi to return controlled search params
let mockSearch: Record<string, string | undefined> = {};

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    getRouteApi: () => ({
      useSearch: () => mockSearch,
    }),
    useNavigate: () => vi.fn(),
  };
});

vi.mock('state/backend-api', () => ({
  useApiStoreHook: <T,>(selector: (s: { enterpriseFeaturesUsed: { name: string; enabled: boolean }[] }) => T) =>
    selector({ enterpriseFeaturesUsed: [] }),
}));

vi.mock('../../../../state/supported-features', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../state/supported-features')>();
  return {
    ...actual,
    useSupportedFeaturesStore: <T,>(selector: (s: Record<string, boolean>) => T) =>
      selector({ createUser: true, deleteUser: true, rolesApi: true, schemaRegistryACLApi: false }),
  };
});

// Polyfills
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView = vi.fn();

// Import after mocks
import AclCreatePage from './acl-create-page';

describe('AclCreatePage — search param → form population', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch = {};
  });

  test('principal input is pre-populated from principalType=User&principalName=my-user', async () => {
    mockSearch = { principalType: 'User', principalName: 'my-user' };

    renderWithFileRoutes(<AclCreatePage />);

    const principalInput = await screen.findByTestId('shared-principal-input');
    await waitFor(() => {
      expect(principalInput).toHaveValue('my-user');
    });

    const typeSelect = screen.getByTestId('shared-principal-type-select');
    expect(typeSelect).toHaveTextContent('User');
  });

  test('principal input is empty when no search params', async () => {
    mockSearch = {};

    renderWithFileRoutes(<AclCreatePage />);

    const principalInput = await screen.findByTestId('shared-principal-input');
    await waitFor(() => {
      expect(principalInput).toHaveValue('');
    });
  });

  test('principal input is editable (not locked) with search params', async () => {
    mockSearch = { principalType: 'User', principalName: 'editable-user' };

    renderWithFileRoutes(<AclCreatePage />);

    const principalInput = await screen.findByTestId('shared-principal-input');
    expect(principalInput).not.toBeDisabled();
  });

  test('principal input updates when search params arrive after initial render', async () => {
    // Simulate: first render has no params (route loading), then params arrive
    mockSearch = {};

    const { rerender } = renderWithFileRoutes(<AclCreatePage />);

    const principalInput = await screen.findByTestId('shared-principal-input');
    expect(principalInput).toHaveValue('');

    // Params arrive (route finishes loading)
    mockSearch = { principalType: 'User', principalName: 'late-user' };
    rerender(<AclCreatePage />);

    await waitFor(() => {
      expect(principalInput).toHaveValue('late-user');
    });
  });
});
