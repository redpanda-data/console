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

rs.mock('@tanstack/react-router', () => {
  const actual = rs.requireActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

rs.mock('react-query/api/schema-registry', () => ({
  ...rs.requireActual<typeof import('react-query/api/schema-registry')>('react-query/api/schema-registry'),
  useSchemaModeQuery: rs.fn(() => ({
    data: 'READWRITE',
    isLoading: false,
  })),
  useSchemaCompatibilityQuery: rs.fn(() => ({
    data: 'BACKWARD',
    isLoading: false,
  })),
  useSchemaDetailsQuery: rs.fn((_subject: string | undefined, _opts?: { enabled?: boolean }) => ({
    data: undefined,
    isLoading: false,
  })),
  useUpdateGlobalCompatibilityMutation: rs.fn(() => ({
    mutate: mockMutateGlobal,
    isPending: false,
  })),
  useUpdateSubjectCompatibilityMutation: rs.fn(() => ({
    mutate: mockMutateSubject,
    isPending: false,
  })),
  useSchemaRegistryContextsQuery: rs.fn(() => ({
    data: [],
    isLoading: false,
  })),
  useUpdateContextCompatibilityMutation: rs.fn(() => ({
    mutate: mockMutateContext,
    isPending: false,
  })),
}));

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
    rs.clearAllMocks();
  });

  afterEach(() => {
    rs.restoreAllMocks();
  });

  describe('Global compatibility (no subjectName)', () => {
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

    test('does not show schema preview panel', async () => {
      renderWithFileRoutes(<EditSchemaCompatibilityPage />);
      // Await the Radio group settling before assertions on absence.
      await screen.findByTestId('edit-compatibility-description');

      expect(screen.queryByTestId('edit-compatibility-subject-name')).not.toBeInTheDocument();
    });

    test('does not show context name header', async () => {
      renderWithFileRoutes(<EditSchemaCompatibilityPage />);
      await screen.findByTestId('edit-compatibility-description');

      expect(screen.queryByTestId('edit-compatibility-context-name')).not.toBeInTheDocument();
    });
  });

  describe('Per-subject compatibility (with subjectName)', () => {
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

    test('shows subject name in schema preview panel', async () => {
      renderWithFileRoutes(<EditSchemaCompatibilityPage subjectName={subjectName} />);

      expect(await screen.findByTestId('edit-compatibility-subject-name')).toHaveTextContent(subjectName);
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
      renderWithFileRoutes(<EditSchemaCompatibilityPage contextName=".test" />);

      expect(await screen.findByTestId('contexts-not-supported')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-compatibility-description')).not.toBeInTheDocument();
    });

    test('shows context name in header when editing context compatibility', async () => {
      rs.mocked(useSchemaRegistryContextsQuery).mockReturnValue({
        data: [{ name: '.test', mode: 'READWRITE', compatibility: 'BACKWARD' }],
        isLoading: false,
      } as never);

      renderWithFileRoutes(<EditSchemaCompatibilityPage contextName=".test" />);

      expect(await screen.findByTestId('edit-compatibility-context-name')).toHaveTextContent('.test');
    });

    test('calls context mutation on save', async () => {
      const user = userEvent.setup();

      rs.mocked(useSchemaRegistryContextsQuery).mockReturnValue({
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

      rs.mocked(useSchemaRegistryContextsQuery).mockReturnValue({
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

      rs.mocked(useSchemaRegistryContextsQuery).mockReturnValue({
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

      rs.mocked(useSchemaRegistryContextsQuery).mockReturnValue({
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

      rs.mocked(useSchemaRegistryContextsQuery).mockReturnValue({
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
      rs.mocked(useSchemaModeQuery).mockReturnValue({
        data: undefined,
        isLoading: true,
      } as never);

      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      // No Radio group renders during skeleton — no async state update to wait for.
      expect(screen.queryByTestId('edit-compatibility-description')).not.toBeInTheDocument();
    });

    test('shows skeleton while loading compatibility', () => {
      rs.mocked(useSchemaCompatibilityQuery).mockReturnValue({
        data: undefined,
        isLoading: true,
      } as never);

      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      expect(screen.queryByTestId('edit-compatibility-description')).not.toBeInTheDocument();
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

      renderWithFileRoutes(<EditSchemaCompatibilityPage subjectName="test-subject" />);

      expect(screen.queryByTestId('edit-compatibility-description')).not.toBeInTheDocument();
    });

    test('shows skeleton while loading contexts', () => {
      useSupportedFeaturesStore.setState({ schemaRegistryContexts: true });

      rs.mocked(useSchemaRegistryContextsQuery).mockReturnValue({
        data: undefined,
        isLoading: true,
      } as never);

      renderWithFileRoutes(<EditSchemaCompatibilityPage contextName=".test" />);

      expect(screen.queryByTestId('edit-compatibility-description')).not.toBeInTheDocument();

      // Unmount before mutating supported-features; otherwise the store
      // update notifies still-mounted subscribers outside any act boundary.
      cleanup();
      useSupportedFeaturesStore.setState({ schemaRegistryContexts: false });
    });

    test('disables save button when user lacks permission', async () => {
      // Ensure mocks are in correct state
      rs.mocked(useSchemaModeQuery).mockReturnValue({
        data: 'READWRITE',
        isLoading: false,
      } as never);
      rs.mocked(useSchemaCompatibilityQuery).mockReturnValue({
        data: 'BACKWARD',
        isLoading: false,
      } as never);

      (api as Record<string, unknown>).userData = { canManageSchemaRegistry: false };

      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      const saveBtn = await screen.findByTestId('edit-compatibility-save-btn');
      expect(saveBtn).toHaveAttribute('disabled');

      (api as Record<string, unknown>).userData = { canManageSchemaRegistry: true };
    });

    test('shows not configured page when schema registry is not configured', () => {
      rs.mocked(useSchemaModeQuery).mockReturnValue({
        data: null,
        isLoading: false,
      } as never);

      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      expect(screen.queryByTestId('edit-compatibility-description')).not.toBeInTheDocument();
    });
  });
});
