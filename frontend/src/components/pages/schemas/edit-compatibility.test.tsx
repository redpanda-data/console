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
import { toast } from 'sonner';
import { api } from 'state/backend-api';
import { useSupportedFeaturesStore } from 'state/supported-features';

import {
  createSchemaRegistryFixture,
  createSchemaRegistryUser,
  createSchemaSubject,
} from './__fixtures__/schema-registry';
import { EditSchemaCompatibilityPage } from './edit-compatibility';
import { renderWithFileRoutes, screen, waitFor } from '../../../test-utils';

rs.mock('sonner', () => ({ toast: { success: rs.fn(), error: rs.fn() } }));

// Real navigate() resolves once the route commits.
const mockNavigate = rs.fn(() => Promise.resolve());

rs.mock('@tanstack/react-router', () => {
  const actual = rs.requireActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

let fixture = createSchemaRegistryFixture();

describe('the EditSchemaCompatibilityPage', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    fixture = createSchemaRegistryFixture();
    api.userData = createSchemaRegistryUser();
    rs.spyOn(globalThis, 'fetch').mockImplementation(fixture.fetch);
  });

  afterEach(() => {
    rs.restoreAllMocks();
  });

  describe('global compatibility (no subjectName)', () => {
    test('calls global mutation on save', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      await user.click(await screen.findByTestId('edit-compatibility-save-btn'));

      await waitFor(() => {
        expect(fixture.write).toHaveBeenCalledWith('config', 'PUT', JSON.stringify({ compatibility: 'BACKWARD' }));
      });
    });

    test('calls navigate on cancel', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      await user.click(await screen.findByTestId('edit-compatibility-cancel-btn'));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({ to: '/schema-registry' });
      });
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

  describe('per-subject compatibility (with subjectName)', () => {
    const subjectName = 'my-test-subject';

    beforeEach(() => {
      fixture.state.details = createSchemaSubject(subjectName);
    });

    test('calls subject mutation on save', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaCompatibilityPage subjectName={subjectName} />);

      await user.click(await screen.findByTestId('edit-compatibility-save-btn'));

      await waitFor(() => {
        expect(fixture.write).toHaveBeenCalledWith(
          'config/my-test-subject',
          'PUT',
          JSON.stringify({ compatibility: 'BACKWARD' })
        );
      });
      expect(fixture.write).toHaveBeenCalledTimes(1);
    });

    test('shows subject name in schema preview panel', async () => {
      renderWithFileRoutes(<EditSchemaCompatibilityPage subjectName={subjectName} />);

      expect(await screen.findByTestId('edit-compatibility-subject-name')).toHaveTextContent(subjectName);
    });

    test('navigates back to subject page on cancel', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaCompatibilityPage subjectName={subjectName} />);

      await user.click(await screen.findByTestId('edit-compatibility-cancel-btn'));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({
          to: `/schema-registry/subjects/${encodeURIComponent(subjectName)}`,
        });
      });
    });
  });

  describe('per-context compatibility (with contextName)', () => {
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
      fixture.state.contexts = [{ name: '.test', mode: 'READWRITE', compatibility: 'BACKWARD' }];

      renderWithFileRoutes(<EditSchemaCompatibilityPage contextName=".test" />);

      expect(await screen.findByTestId('edit-compatibility-context-name')).toHaveTextContent('.test');
    });

    test('calls context mutation on save', async () => {
      const user = userEvent.setup();

      fixture.state.contexts = [{ name: '.test', mode: 'READWRITE', compatibility: 'FULL' }];

      renderWithFileRoutes(<EditSchemaCompatibilityPage contextName=".test" />);

      await user.click(await screen.findByTestId('edit-compatibility-save-btn'));

      await waitFor(() => {
        expect(fixture.write).toHaveBeenCalledWith(
          'config/%3A.test%3A',
          'PUT',
          JSON.stringify({ compatibility: 'FULL' })
        );
      });
      expect(fixture.write).toHaveBeenCalledTimes(1);
    });

    test('defaults to DEFAULT when context compatibility is undefined', async () => {
      const user = userEvent.setup();

      fixture.state.contexts = [{ name: '.new-ctx', mode: 'READWRITE', compatibility: undefined }];

      renderWithFileRoutes(<EditSchemaCompatibilityPage contextName=".new-ctx" />);

      await user.click(await screen.findByTestId('edit-compatibility-save-btn'));

      await waitFor(() => {
        expect(fixture.write).toHaveBeenCalledWith('config/%3A.new-ctx%3A', 'DELETE', undefined);
      });
    });

    test('navigates to schema-registry with context search param on cancel', async () => {
      const user = userEvent.setup();

      fixture.state.contexts = [{ name: '.test', mode: 'READWRITE', compatibility: 'BACKWARD' }];

      renderWithFileRoutes(<EditSchemaCompatibilityPage contextName=".test" />);

      await user.click(await screen.findByTestId('edit-compatibility-cancel-btn'));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({
          to: '/schema-registry',
          search: { context: '.test' },
        });
      });
    });

    test('calls onSuccess callback which shows toast and navigates', async () => {
      const user = userEvent.setup();

      fixture.state.contexts = [{ name: '.test', mode: 'READWRITE', compatibility: 'FULL' }];

      renderWithFileRoutes(<EditSchemaCompatibilityPage contextName=".test" />);

      await user.click(await screen.findByTestId('edit-compatibility-save-btn'));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({
          to: '/schema-registry',
          search: { context: '.test' },
        });
      });
    });

    test('calls onError callback which shows error toast', async () => {
      fixture.write.mockResolvedValue(new Response('Server error', { status: 500 }));
      const user = userEvent.setup();

      fixture.state.contexts = [{ name: '.test', mode: 'READWRITE', compatibility: 'FULL' }];

      renderWithFileRoutes(<EditSchemaCompatibilityPage contextName=".test" />);

      await user.click(await screen.findByTestId('edit-compatibility-save-btn'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to update compatibility mode', {
          description: 'Error: Server error',
        });
      });
    });
  });

  describe('loading and edge cases', () => {
    test('shows skeleton while loading mode', () => {
      fixture.pending.add('mode');

      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      // No Radio group renders during skeleton — no async state update to wait for.
      expect(screen.queryByTestId('edit-compatibility-description')).not.toBeInTheDocument();
    });

    test('shows skeleton while loading compatibility', () => {
      fixture.pending.add('compatibility');

      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      expect(screen.queryByTestId('edit-compatibility-description')).not.toBeInTheDocument();
    });

    test('shows skeleton while loading subject details', () => {
      fixture.state.mode = 'READWRITE';
      fixture.pending.add('details');

      renderWithFileRoutes(<EditSchemaCompatibilityPage subjectName="test-subject" />);

      expect(screen.queryByTestId('edit-compatibility-description')).not.toBeInTheDocument();
    });

    test('shows skeleton while loading contexts', () => {
      useSupportedFeaturesStore.setState({ schemaRegistryContexts: true });

      fixture.pending.add('contexts');

      renderWithFileRoutes(<EditSchemaCompatibilityPage contextName=".test" />);

      expect(screen.queryByTestId('edit-compatibility-description')).not.toBeInTheDocument();

      // Unmount before mutating supported-features; otherwise the store
      // update notifies still-mounted subscribers outside any act boundary.
      cleanup();
      useSupportedFeaturesStore.setState({ schemaRegistryContexts: false });
    });

    test('disables save button when user lacks permission', async () => {
      // Ensure mocks are in correct state
      fixture.state.mode = 'READWRITE';
      fixture.state.compatibility = 'BACKWARD';

      api.userData = createSchemaRegistryUser(false);

      renderWithFileRoutes(<EditSchemaCompatibilityPage />);

      const saveBtn = await screen.findByTestId('edit-compatibility-save-btn');
      expect(saveBtn).toHaveAttribute('disabled');

      api.userData = createSchemaRegistryUser();
    });

    test('shows not configured page when schema registry is not configured', async () => {
      fixture.state.mode = null;

      renderWithFileRoutes(<EditSchemaCompatibilityPage />);
      expect(await screen.findByTestId('schema-not-configured')).toBeInTheDocument();

      expect(screen.queryByTestId('edit-compatibility-description')).not.toBeInTheDocument();
    });
  });
});
