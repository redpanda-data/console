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
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('react-query/api/schema-registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-query/api/schema-registry')>();
  return {
    ...actual,
    useSchemaModeQuery: vi.fn(() => ({
      data: 'READWRITE',
      isLoading: false,
    })),
    useSchemaDetailsQuery: vi.fn((_subject: string | undefined, _opts?: { enabled?: boolean }) => ({
      data: undefined,
      isLoading: false,
    })),
    useUpdateGlobalModeMutation: vi.fn(() => ({
      mutate: mockMutateGlobal,
      isPending: false,
    })),
    useUpdateSubjectModeMutation: vi.fn(() => ({
      mutate: mockMutateSubject,
      isPending: false,
    })),
    useSchemaRegistryContextsQuery: vi.fn(() => ({
      data: [],
      isLoading: false,
    })),
    useUpdateContextModeMutation: vi.fn(() => ({
      mutate: mockMutateContext,
      isPending: false,
    })),
  };
});

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
  useSchemaDetailsQuery,
  useSchemaModeQuery,
  useSchemaRegistryContextsQuery,
} from 'react-query/api/schema-registry';
import { toast } from 'sonner';
import { api } from 'state/backend-api';
import { useSupportedFeaturesStore } from 'state/supported-features';

import EditSchemaModePage from './edit-mode';

describe('EditSchemaModePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Global mode (no subjectName)', () => {
    test('renders description text', () => {
      renderWithFileRoutes(<EditSchemaModePage />);

      expect(screen.getByTestId('edit-mode-description')).toHaveTextContent(
        'Mode controls whether the Schema Registry accepts new schema registrations and under what conditions.'
      );
    });

    test('renders 3 mode options for global mode', () => {
      renderWithFileRoutes(<EditSchemaModePage />);

      expect(screen.getByText('Read/Write')).toBeInTheDocument();
      expect(screen.getByText('Read Only')).toBeInTheDocument();
      expect(screen.getByText('Import')).toBeInTheDocument();
      // Should NOT show Default option when no subjectName
      expect(screen.queryByText('Default')).not.toBeInTheDocument();
    });

    test('shows warning text on Import option', () => {
      renderWithFileRoutes(<EditSchemaModePage />);

      expect(
        screen.getByText('This mode allows overriding schema IDs. Incorrect use can cause ID collisions and data loss.')
      ).toBeInTheDocument();
    });

    test('renders Save and Cancel buttons', () => {
      renderWithFileRoutes(<EditSchemaModePage />);

      expect(screen.getByTestId('edit-mode-save-btn')).toBeInTheDocument();
      expect(screen.getByTestId('edit-mode-cancel-btn')).toBeInTheDocument();
    });

    test('calls global mutation on save', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaModePage />);

      await user.click(screen.getByTestId('edit-mode-save-btn'));

      expect(mockMutateGlobal).toHaveBeenCalledWith(
        'READWRITE',
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
    });

    test('allows selecting a different mode before saving', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaModePage />);

      // Click the Read Only option
      await user.click(screen.getByText('Read Only'));
      await user.click(screen.getByTestId('edit-mode-save-btn'));

      expect(mockMutateGlobal).toHaveBeenCalledWith(
        'READONLY',
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
    });

    test('calls navigate on cancel', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaModePage />);

      await user.click(screen.getByTestId('edit-mode-cancel-btn'));

      expect(mockNavigate).toHaveBeenCalledWith({ to: '/schema-registry' });
    });

    test('does not show schema preview panel', () => {
      renderWithFileRoutes(<EditSchemaModePage />);

      // This is only present in the subject-mode.
      expect(screen.queryByTestId('edit-mode-subject-name')).not.toBeInTheDocument();
    });
  });

  describe('Per-subject mode (with subjectName)', () => {
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

    test('renders 4 mode options including Default', () => {
      renderWithFileRoutes(<EditSchemaModePage subjectName={subjectName} />);

      expect(screen.getByText('Default')).toBeInTheDocument();
      expect(screen.getByText('Read/Write')).toBeInTheDocument();
      expect(screen.getByText('Read Only')).toBeInTheDocument();
      expect(screen.getByText('Import')).toBeInTheDocument();
    });

    test('shows Default option description', () => {
      renderWithFileRoutes(<EditSchemaModePage subjectName={subjectName} />);

      expect(screen.getByText('Use the globally configured default mode.')).toBeInTheDocument();
    });

    test('calls subject mutation on save', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaModePage subjectName={subjectName} />);

      await user.click(screen.getByTestId('edit-mode-save-btn'));

      expect(mockMutateSubject).toHaveBeenCalledWith(
        { subjectName, mode: 'READWRITE' },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
      expect(mockMutateGlobal).not.toHaveBeenCalled();
    });

    test('can select Default mode and save', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaModePage subjectName={subjectName} />);

      await user.click(screen.getByText('Default'));
      await user.click(screen.getByTestId('edit-mode-save-btn'));

      expect(mockMutateSubject).toHaveBeenCalledWith(
        { subjectName, mode: 'DEFAULT' },
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        })
      );
    });

    test('navigates back to subject page on cancel', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaModePage subjectName={subjectName} />);

      await user.click(screen.getByTestId('edit-mode-cancel-btn'));

      expect(mockNavigate).toHaveBeenCalledWith({
        to: `/schema-registry/subjects/${encodeURIComponent(subjectName)}`,
      });
    });

    test('shows subject name in schema preview panel', () => {
      renderWithFileRoutes(<EditSchemaModePage subjectName={subjectName} />);

      expect(screen.getByTestId('edit-mode-subject-name')).toHaveTextContent(subjectName);
    });

    test('shows schema heading in preview panel', () => {
      renderWithFileRoutes(<EditSchemaModePage subjectName={subjectName} />);

      expect(screen.getByText('Schema')).toBeInTheDocument();
    });
  });

  describe('Per-context mode (with contextName)', () => {
    beforeEach(() => {
      useSupportedFeaturesStore.setState({ schemaRegistryContexts: true });
    });

    afterEach(() => {
      useSupportedFeaturesStore.setState({ schemaRegistryContexts: false });
    });

    test('shows not-supported page when contexts feature is disabled', () => {
      useSupportedFeaturesStore.setState({ schemaRegistryContexts: false });
      renderWithFileRoutes(<EditSchemaModePage contextName=".test" />);

      expect(screen.getByTestId('contexts-not-supported')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-mode-description')).not.toBeInTheDocument();
    });

    test('shows context name in header when editing context mode', () => {
      vi.mocked(useSchemaRegistryContextsQuery).mockReturnValue({
        data: [{ name: '.test', mode: 'READWRITE', compatibility: 'BACKWARD' }],
        isLoading: false,
      } as never);

      renderWithFileRoutes(<EditSchemaModePage contextName=".test" />);

      expect(screen.getByTestId('edit-mode-context-name')).toHaveTextContent('.test');
    });
  });

  describe('Loading and edge cases', () => {
    test('shows skeleton while loading mode', () => {
      vi.mocked(useSchemaModeQuery).mockReturnValue({
        data: undefined,
        isLoading: true,
      } as never);

      renderWithFileRoutes(<EditSchemaModePage />);

      // Should not render the form content
      expect(screen.queryByTestId('edit-mode-description')).not.toBeInTheDocument();
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

      renderWithFileRoutes(<EditSchemaModePage subjectName="test-subject" />);

      expect(screen.queryByTestId('edit-mode-description')).not.toBeInTheDocument();
    });

    test('disables save button when user lacks permission', () => {
      (api as Record<string, unknown>).userData = { canManageSchemaRegistry: false };

      renderWithFileRoutes(<EditSchemaModePage />);

      expect(screen.getByTestId('edit-mode-save-btn')).toBeDisabled();

      // Restore
      (api as Record<string, unknown>).userData = { canManageSchemaRegistry: true };
    });

    test('shows not configured page when schema registry is not configured', () => {
      vi.mocked(useSchemaModeQuery).mockReturnValue({
        data: null,
        isLoading: false,
      } as never);

      renderWithFileRoutes(<EditSchemaModePage />);

      expect(screen.queryByTestId('edit-mode-description')).not.toBeInTheDocument();

      // Restore default mock
      vi.mocked(useSchemaModeQuery).mockReturnValue({
        data: 'READWRITE',
        isLoading: false,
      } as never);
    });

    test('calls onSuccess callback which shows toast and navigates', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaModePage />);

      await user.click(screen.getByTestId('edit-mode-save-btn'));

      // Get the onSuccess callback from the mutation call
      const mutateCall = mockMutateGlobal.mock.calls[0];
      const callbacks = mutateCall[1];
      callbacks.onSuccess();

      expect(toast.success).toHaveBeenCalledWith('Mode updated to READWRITE');
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/schema-registry' });
    });

    test('calls onError callback which shows error toast', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaModePage />);

      await user.click(screen.getByTestId('edit-mode-save-btn'));

      const mutateCall = mockMutateGlobal.mock.calls[0];
      const callbacks = mutateCall[1];
      callbacks.onError(new Error('Server error'));

      expect(toast.error).toHaveBeenCalledWith('Failed to update mode', {
        description: 'Error: Server error',
      });
    });
  });
});
