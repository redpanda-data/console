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

import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithFileRoutes, screen } from 'test-utils';

const mockNavigate = rs.fn();
const mockMutateGlobal = rs.fn();
const mockMutateSubject = rs.fn();
const mockMutateContext = rs.fn();
rs.mock('sonner', () => ({
  toast: {
    success: rs.fn(),
    error: rs.fn(),
  },
}));

rs.mock('@tanstack/react-router', () => {
  const actual = rs.requireActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

rs.mock('react-query/api/schema-registry', () => {
  const actual = rs.requireActual<typeof import('react-query/api/schema-registry')>('react-query/api/schema-registry');
  return {
    ...actual,
    useSchemaModeQuery: rs.fn(() => ({
      data: 'READWRITE',
      isLoading: false,
    })),
    useSchemaDetailsQuery: rs.fn((_subject: string | undefined, _opts?: { enabled?: boolean }) => ({
      data: undefined,
      isLoading: false,
    })),
    useUpdateGlobalModeMutation: rs.fn(() => ({
      mutate: mockMutateGlobal,
      isPending: false,
    })),
    useUpdateSubjectModeMutation: rs.fn(() => ({
      mutate: mockMutateSubject,
      isPending: false,
    })),
    useSchemaRegistryContextsQuery: rs.fn(() => ({
      data: [],
      isLoading: false,
    })),
    useUpdateContextModeMutation: rs.fn(() => ({
      mutate: mockMutateContext,
      isPending: false,
    })),
  };
});

rs.mock('state/backend-api', () => {
  const actual = rs.requireActual<typeof import('state/backend-api')>('state/backend-api');
  return {
    ...actual,
    api: {
      ...actual.api,
      userData: { canManageSchemaRegistry: true },
    },
  };
});

rs.mock('state/ui-state', () => ({
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
    rs.clearAllMocks();
  });

  afterEach(() => {
    rs.restoreAllMocks();
  });

  describe('Global mode (no subjectName)', () => {
    test('renders 3 mode options for global mode', async () => {
      renderWithFileRoutes(<EditSchemaModePage />);

      expect(await screen.findByText('Read/Write')).toBeInTheDocument();
      expect(screen.getByText('Read Only')).toBeInTheDocument();
      expect(screen.getByText('Import')).toBeInTheDocument();
      // Should NOT show Default option when no subjectName
      expect(screen.queryByText('Default')).not.toBeInTheDocument();
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

    test('does not show schema preview panel', async () => {
      renderWithFileRoutes(<EditSchemaModePage />);
      // Await Radio group settling so absence assertions run inside act scope.
      await screen.findByTestId('edit-mode-description');

      // This is only present in the subject-mode.
      expect(screen.queryByTestId('edit-mode-subject-name')).not.toBeInTheDocument();
    });
  });

  describe('Per-subject mode (with subjectName)', () => {
    const subjectName = 'my-test-subject';

    beforeEach(() => {
      rs.mocked(useSchemaDetailsQuery).mockReturnValue({
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

    test('renders 4 mode options including Default', async () => {
      renderWithFileRoutes(<EditSchemaModePage subjectName={subjectName} />);

      expect(await screen.findByText('Default')).toBeInTheDocument();
      expect(screen.getByText('Read/Write')).toBeInTheDocument();
      expect(screen.getByText('Read Only')).toBeInTheDocument();
      expect(screen.getByText('Import')).toBeInTheDocument();
    });

    test('shows Default option description', async () => {
      renderWithFileRoutes(<EditSchemaModePage subjectName={subjectName} />);

      expect(await screen.findByText('Use the globally configured default mode.')).toBeInTheDocument();
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

    test('shows subject name in schema preview panel', async () => {
      renderWithFileRoutes(<EditSchemaModePage subjectName={subjectName} />);

      expect(await screen.findByTestId('edit-mode-subject-name')).toHaveTextContent(subjectName);
    });
  });

  describe('Per-context mode (with contextName)', () => {
    beforeEach(() => {
      useSupportedFeaturesStore.setState({ schemaRegistryContexts: true });
    });

    afterEach(() => {
      // Unmount the React tree BEFORE mutating the supported-features store.
      // Otherwise the setState notifies still-mounted Radix Radio / Tooltip
      // subscribers outside any act boundary and emits "update inside a test
      // was not wrapped in act(...)" warnings attributed to the just-finished
      // test. The global afterEach also calls cleanup() but runs after this
      // block, so we have to unmount eagerly here.
      cleanup();
      useSupportedFeaturesStore.setState({ schemaRegistryContexts: false });
    });

    test('shows not-supported page when contexts feature is disabled', async () => {
      useSupportedFeaturesStore.setState({ schemaRegistryContexts: false });
      renderWithFileRoutes(<EditSchemaModePage contextName=".test" />);

      expect(await screen.findByTestId('contexts-not-supported')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-mode-description')).not.toBeInTheDocument();
    });

    test('shows context name in header when editing context mode', async () => {
      rs.mocked(useSchemaRegistryContextsQuery).mockReturnValue({
        data: [{ name: '.test', mode: 'READWRITE', compatibility: 'BACKWARD' }],
        isLoading: false,
      } as never);

      renderWithFileRoutes(<EditSchemaModePage contextName=".test" />);

      expect(await screen.findByTestId('edit-mode-context-name')).toHaveTextContent('.test');
    });
  });

  describe('Loading and edge cases', () => {
    test('shows skeleton while loading mode', () => {
      rs.mocked(useSchemaModeQuery).mockReturnValue({
        data: undefined,
        isLoading: true,
      } as never);

      renderWithFileRoutes(<EditSchemaModePage />);

      // Should not render the form content
      expect(screen.queryByTestId('edit-mode-description')).not.toBeInTheDocument();
    });

    test('shows skeleton while loading subject details', () => {
      rs.mocked(useSchemaModeQuery).mockReturnValue({
        data: 'READWRITE',
        isLoading: false,
      } as never);
      rs.mocked(useSchemaDetailsQuery).mockReturnValue({
        data: undefined,
        isLoading: true,
      } as never);

      renderWithFileRoutes(<EditSchemaModePage subjectName="test-subject" />);

      expect(screen.queryByTestId('edit-mode-description')).not.toBeInTheDocument();
    });

    test('disables save button when user lacks permission', async () => {
      (api as Record<string, unknown>).userData = { canManageSchemaRegistry: false };

      renderWithFileRoutes(<EditSchemaModePage />);

      const saveBtn = await screen.findByTestId('edit-mode-save-btn');
      expect(saveBtn).toBeDisabled();

      // Restore
      (api as Record<string, unknown>).userData = { canManageSchemaRegistry: true };
    });

    test('shows not configured page when schema registry is not configured', () => {
      rs.mocked(useSchemaModeQuery).mockReturnValue({
        data: null,
        isLoading: false,
      } as never);

      renderWithFileRoutes(<EditSchemaModePage />);

      expect(screen.queryByTestId('edit-mode-description')).not.toBeInTheDocument();

      // Restore default mock
      rs.mocked(useSchemaModeQuery).mockReturnValue({
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
