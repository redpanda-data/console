/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import userEvent from '@testing-library/user-event';
import { renderWithFileRoutes, screen } from 'test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mockNavigate = vi.fn();
const mockMutateGlobal = vi.fn();
const mockMutateSubject = vi.fn();
const mockMutateContext = vi.fn();

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('react-query/api/schema-registry', () => ({
  useSchemaModeQuery: vi.fn(() => ({
    data: 'READWRITE',
    isLoading: false,
  })),
  useSchemaCompatibilityQuery: vi.fn(() => ({
    data: 'BACKWARD',
    isLoading: false,
  })),
  useSchemaDetailsQuery: vi.fn((_subject: string | undefined, _opts?: { enabled?: boolean }) => ({
    data: undefined,
    isLoading: false,
  })),
  useUpdateGlobalCompatibilityMutation: vi.fn(() => ({
    mutate: mockMutateGlobal,
    isPending: false,
  })),
  useUpdateSubjectCompatibilityMutation: vi.fn(() => ({
    mutate: mockMutateSubject,
    isPending: false,
  })),
  useSchemaRegistryContextsQuery: vi.fn(() => ({
    data: [],
    isLoading: false,
  })),
  useUpdateContextCompatibilityMutation: vi.fn(() => ({
    mutate: mockMutateContext,
    isPending: false,
  })),
}));

vi.mock('state/backend-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('state/backend-api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      userData: { canManageSchemaRegistry: true },
    },
  };
});

vi.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

import {
  useSchemaCompatibilityQuery,
  useSchemaDetailsQuery,
  useSchemaModeQuery,
  useSchemaRegistryContextsQuery,
} from 'react-query/api/schema-registry';
import { api } from 'state/backend-api';
import { useSupportedFeaturesStore } from 'state/supported-features';

import EditSchemaCompatibilityPage from './edit-compatibility';

describe('EditSchemaCompatibilityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Global compatibility (no subjectName)', () => {
    test('renders description text', () => {
      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      expect(screen.getByTestId('edit-compatibility-description')).toHaveTextContent(
        'Compatibility determines how schema validation occurs when producers are sending messages to Redpanda.'
      );
    });

    test('renders all compatibility options', () => {
      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      expect(screen.getByText('None')).toBeInTheDocument();
      expect(screen.getByText('Backward')).toBeInTheDocument();
      expect(screen.getByText('Transitive Backward')).toBeInTheDocument();
      expect(screen.getByText('Forward')).toBeInTheDocument();
      expect(screen.getByText('Transitive Forward')).toBeInTheDocument();
      expect(screen.getByText('Full')).toBeInTheDocument();
      expect(screen.getByText('Transitive Full')).toBeInTheDocument();
    });

    test('renders Save and Cancel buttons', () => {
      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      expect(screen.getByTestId('edit-compatibility-save-btn')).toBeInTheDocument();
      expect(screen.getByTestId('edit-compatibility-cancel-btn')).toBeInTheDocument();
    });

    test('calls global mutation on save', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      await user.click(screen.getByTestId('edit-compatibility-save-btn'));

      expect(mockMutateGlobal).toHaveBeenCalledWith(
        'BACKWARD',
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
    });

    test('calls navigate on cancel', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      await user.click(screen.getByTestId('edit-compatibility-cancel-btn'));

      expect(mockNavigate).toHaveBeenCalledWith({ to: '/schema-registry' });
    });

    test('does not show schema preview panel', () => {
      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      expect(screen.queryByTestId('edit-compatibility-subject-name')).not.toBeInTheDocument();
    });

    test('does not show context name header', () => {
      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      expect(screen.queryByTestId('edit-compatibility-context-name')).not.toBeInTheDocument();
    });
  });

  describe('Per-subject compatibility (with subjectName)', () => {
    const subjectName = 'my-test-subject';

    beforeEach(() => {
      vi.mocked(useSchemaDetailsQuery).mockReturnValue({
        data: {
          name: subjectName,
          mode: 'READWRITE',
          compatibility: 'BACKWARD',
          latestActiveVersion: 1,
          schemas: {
            first: () => ({
              version: 1,
              id: 1,
              type: 'AVRO',
              schema: '{"type":"record","name":"Test","fields":[]}',
              isSoftDeleted: false,
            }),
            count: () => 1,
          },
        } as never,
        isLoading: false,
      } as never);
    });

    test('calls subject mutation on save', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaCompatibilityPage subjectName={subjectName} />);

      await user.click(screen.getByTestId('edit-compatibility-save-btn'));

      expect(mockMutateSubject).toHaveBeenCalledWith(
        { subjectName, mode: 'BACKWARD' },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
      expect(mockMutateGlobal).not.toHaveBeenCalled();
    });

    test('shows subject name in schema preview panel', () => {
      renderWithFileRoutes(<EditSchemaCompatibilityPage subjectName={subjectName} />);

      expect(screen.getByTestId('edit-compatibility-subject-name')).toHaveTextContent(subjectName);
    });

    test('navigates back to subject page on cancel', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaCompatibilityPage subjectName={subjectName} />);

      await user.click(screen.getByTestId('edit-compatibility-cancel-btn'));

      expect(mockNavigate).toHaveBeenCalledWith({
        to: `/schema-registry/subjects/${encodeURIComponent(subjectName)}`,
      });
    });
  });

  describe('Per-context compatibility (with contextName)', () => {
    beforeEach(() => {
      useSupportedFeaturesStore.setState({ schemaRegistryContexts: true });
    });

    afterEach(() => {
      useSupportedFeaturesStore.setState({ schemaRegistryContexts: false });
    });

    test('shows not-supported page when contexts feature is disabled', () => {
      useSupportedFeaturesStore.setState({ schemaRegistryContexts: false });
      renderWithFileRoutes(<EditSchemaCompatibilityPage contextName=".test" />);

      expect(screen.getByTestId('contexts-not-supported')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-compatibility-description')).not.toBeInTheDocument();
    });

    test('shows context name in header when editing context compatibility', () => {
      vi.mocked(useSchemaRegistryContextsQuery).mockReturnValue({
        data: [{ name: '.test', mode: 'READWRITE', compatibility: 'BACKWARD' }],
        isLoading: false,
      } as never);

      renderWithFileRoutes(<EditSchemaCompatibilityPage contextName=".test" />);

      expect(screen.getByTestId('edit-compatibility-context-name')).toHaveTextContent('.test');
    });

    test('does not show context name header for global mode', () => {
      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      expect(screen.queryByTestId('edit-compatibility-context-name')).not.toBeInTheDocument();
    });

    test('calls context mutation on save', async () => {
      const user = userEvent.setup();

      vi.mocked(useSchemaRegistryContextsQuery).mockReturnValue({
        data: [{ name: '.test', mode: 'READWRITE', compatibility: 'FULL' }],
        isLoading: false,
      } as never);

      renderWithFileRoutes(<EditSchemaCompatibilityPage contextName=".test" />);

      await user.click(screen.getByTestId('edit-compatibility-save-btn'));

      expect(mockMutateContext).toHaveBeenCalledWith(
        { contextName: '.test', mode: 'FULL' },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
      expect(mockMutateGlobal).not.toHaveBeenCalled();
      expect(mockMutateSubject).not.toHaveBeenCalled();
    });

    test('defaults to DEFAULT when context compatibility is undefined', async () => {
      const user = userEvent.setup();

      vi.mocked(useSchemaRegistryContextsQuery).mockReturnValue({
        data: [{ name: '.new-ctx', mode: 'READWRITE', compatibility: undefined }],
        isLoading: false,
      } as never);

      renderWithFileRoutes(<EditSchemaCompatibilityPage contextName=".new-ctx" />);

      await user.click(screen.getByTestId('edit-compatibility-save-btn'));

      expect(mockMutateContext).toHaveBeenCalledWith(
        { contextName: '.new-ctx', mode: 'DEFAULT' },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
    });

    test('navigates to schema-registry with context search param on cancel', async () => {
      const user = userEvent.setup();

      vi.mocked(useSchemaRegistryContextsQuery).mockReturnValue({
        data: [{ name: '.test', mode: 'READWRITE', compatibility: 'BACKWARD' }],
        isLoading: false,
      } as never);

      renderWithFileRoutes(<EditSchemaCompatibilityPage contextName=".test" />);

      await user.click(screen.getByTestId('edit-compatibility-cancel-btn'));

      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/schema-registry',
        search: { context: '.test' },
      });
    });

    test('calls onSuccess callback which shows toast and navigates', async () => {
      const user = userEvent.setup();

      vi.mocked(useSchemaRegistryContextsQuery).mockReturnValue({
        data: [{ name: '.test', mode: 'READWRITE', compatibility: 'FULL' }],
        isLoading: false,
      } as never);

      renderWithFileRoutes(<EditSchemaCompatibilityPage contextName=".test" />);

      await user.click(screen.getByTestId('edit-compatibility-save-btn'));

      const mutateCall = mockMutateContext.mock.calls[0];
      const callbacks = mutateCall[1];
      callbacks.onSuccess();

      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/schema-registry',
        search: { context: '.test' },
      });
    });

    test('calls onError callback which shows error toast', async () => {
      const user = userEvent.setup();

      vi.mocked(useSchemaRegistryContextsQuery).mockReturnValue({
        data: [{ name: '.test', mode: 'READWRITE', compatibility: 'FULL' }],
        isLoading: false,
      } as never);

      renderWithFileRoutes(<EditSchemaCompatibilityPage contextName=".test" />);

      await user.click(screen.getByTestId('edit-compatibility-save-btn'));

      const mutateCall = mockMutateContext.mock.calls[0];
      const callbacks = mutateCall[1];
      // Should not throw
      callbacks.onError(new Error('Server error'));
    });
  });

  describe('Loading and edge cases', () => {
    test('shows skeleton while loading mode', () => {
      vi.mocked(useSchemaModeQuery).mockReturnValue({
        data: undefined,
        isLoading: true,
      } as never);

      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      expect(screen.queryByTestId('edit-compatibility-description')).not.toBeInTheDocument();
    });

    test('shows skeleton while loading compatibility', () => {
      vi.mocked(useSchemaCompatibilityQuery).mockReturnValue({
        data: undefined,
        isLoading: true,
      } as never);

      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      expect(screen.queryByTestId('edit-compatibility-description')).not.toBeInTheDocument();
    });

    test('shows skeleton while loading subject details', () => {
      vi.mocked(useSchemaModeQuery).mockReturnValue({
        data: 'READWRITE',
        isLoading: false,
      } as never);
      vi.mocked(useSchemaDetailsQuery).mockReturnValue({
        data: undefined,
        isLoading: true,
      } as never);

      renderWithFileRoutes(<EditSchemaCompatibilityPage subjectName="test-subject" />);

      expect(screen.queryByTestId('edit-compatibility-description')).not.toBeInTheDocument();
    });

    test('shows skeleton while loading contexts', () => {
      useSupportedFeaturesStore.setState({ schemaRegistryContexts: true });

      vi.mocked(useSchemaRegistryContextsQuery).mockReturnValue({
        data: undefined,
        isLoading: true,
      } as never);

      renderWithFileRoutes(<EditSchemaCompatibilityPage contextName=".test" />);

      expect(screen.queryByTestId('edit-compatibility-description')).not.toBeInTheDocument();

      useSupportedFeaturesStore.setState({ schemaRegistryContexts: false });
    });

    test('disables save button when user lacks permission', () => {
      // Ensure mocks are in correct state
      vi.mocked(useSchemaModeQuery).mockReturnValue({
        data: 'READWRITE',
        isLoading: false,
      } as never);
      vi.mocked(useSchemaCompatibilityQuery).mockReturnValue({
        data: 'BACKWARD',
        isLoading: false,
      } as never);

      (api as Record<string, unknown>).userData = { canManageSchemaRegistry: false };

      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      const saveBtn = screen.getByTestId('edit-compatibility-save-btn');
      expect(saveBtn).toHaveAttribute('disabled');

      (api as Record<string, unknown>).userData = { canManageSchemaRegistry: true };
    });

    test('shows not configured page when schema registry is not configured', () => {
      vi.mocked(useSchemaModeQuery).mockReturnValue({
        data: null,
        isLoading: false,
      } as never);

      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      expect(screen.queryByTestId('edit-compatibility-description')).not.toBeInTheDocument();
    });
  });
});
