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
import { EditSchemaModePage } from './edit-mode';
import { renderWithFileRoutes, screen, waitFor } from '../../../test-utils';

// Real navigate() resolves once the route commits.
const mockNavigate = rs.fn(() => Promise.resolve());
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

let fixture = createSchemaRegistryFixture();

describe('the EditSchemaModePage', () => {
  beforeEach(() => {
    rs.clearAllMocks();
    fixture = createSchemaRegistryFixture();
    api.userData = createSchemaRegistryUser();
    rs.spyOn(globalThis, 'fetch').mockImplementation(fixture.fetch);
  });

  afterEach(() => {
    rs.restoreAllMocks();
  });

  describe('global mode (no subjectName)', () => {
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

      await user.click(await screen.findByTestId('edit-mode-save-btn'));

      await waitFor(() => {
        expect(fixture.write).toHaveBeenCalledWith('mode', 'PUT', JSON.stringify({ mode: 'READWRITE' }));
      });
    });

    test('allows selecting a different mode before saving', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaModePage />);

      // Click the Read Only option
      await user.click(await screen.findByText('Read Only'));
      await user.click(await screen.findByTestId('edit-mode-save-btn'));

      await waitFor(() => {
        expect(fixture.write).toHaveBeenCalledWith('mode', 'PUT', JSON.stringify({ mode: 'READONLY' }));
      });
    });

    test('calls navigate on cancel', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaModePage />);

      await user.click(await screen.findByTestId('edit-mode-cancel-btn'));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({ to: '/schema-registry' });
      });
    });

    test('does not show schema preview panel', async () => {
      renderWithFileRoutes(<EditSchemaModePage />);
      // Await Radio group settling so absence assertions run inside act scope.
      await screen.findByTestId('edit-mode-description');

      // This is only present in the subject-mode.
      expect(screen.queryByTestId('edit-mode-subject-name')).not.toBeInTheDocument();
    });
  });

  describe('per-subject mode (with subjectName)', () => {
    const subjectName = 'my-test-subject';

    beforeEach(() => {
      fixture.state.details = createSchemaSubject(subjectName);
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

      await user.click(await screen.findByTestId('edit-mode-save-btn'));

      await waitFor(() => {
        expect(fixture.write).toHaveBeenCalledWith(
          'mode/my-test-subject',
          'PUT',
          JSON.stringify({ mode: 'READWRITE' })
        );
      });
      expect(fixture.write).toHaveBeenCalledTimes(1);
    });

    test('can select Default mode and save', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaModePage subjectName={subjectName} />);

      await user.click(await screen.findByText('Default'));
      await user.click(await screen.findByTestId('edit-mode-save-btn'));

      await waitFor(() => {
        expect(fixture.write).toHaveBeenCalledWith('mode/my-test-subject', 'DELETE', undefined);
      });
    });

    test('navigates back to subject page on cancel', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaModePage subjectName={subjectName} />);

      await user.click(await screen.findByTestId('edit-mode-cancel-btn'));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({
          to: `/schema-registry/subjects/${encodeURIComponent(subjectName)}`,
        });
      });
    });

    test('shows subject name in schema preview panel', async () => {
      renderWithFileRoutes(<EditSchemaModePage subjectName={subjectName} />);

      expect(await screen.findByTestId('edit-mode-subject-name')).toHaveTextContent(subjectName);
    });
  });

  describe('per-context mode (with contextName)', () => {
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
      fixture.state.contexts = [{ name: '.test', mode: 'READWRITE', compatibility: 'BACKWARD' }];

      renderWithFileRoutes(<EditSchemaModePage contextName=".test" />);

      expect(await screen.findByTestId('edit-mode-context-name')).toHaveTextContent('.test');
    });
  });

  describe('loading and edge cases', () => {
    test('shows skeleton while loading mode', () => {
      fixture.pending.add('mode');

      renderWithFileRoutes(<EditSchemaModePage />);

      // Should not render the form content
      expect(screen.queryByTestId('edit-mode-description')).not.toBeInTheDocument();
    });

    test('shows skeleton while loading subject details', () => {
      fixture.state.mode = 'READWRITE';
      fixture.pending.add('details');

      renderWithFileRoutes(<EditSchemaModePage subjectName="test-subject" />);

      expect(screen.queryByTestId('edit-mode-description')).not.toBeInTheDocument();
    });

    test('disables save button when user lacks permission', async () => {
      api.userData = createSchemaRegistryUser(false);

      renderWithFileRoutes(<EditSchemaModePage />);

      const saveBtn = await screen.findByTestId('edit-mode-save-btn');
      expect(saveBtn).toBeDisabled();

      // Restore
      api.userData = createSchemaRegistryUser();
    });

    test('shows not configured page when schema registry is not configured', async () => {
      fixture.state.mode = null;

      renderWithFileRoutes(<EditSchemaModePage />);
      expect(await screen.findByTestId('schema-not-configured')).toBeInTheDocument();

      expect(screen.queryByTestId('edit-mode-description')).not.toBeInTheDocument();

      // Restore default mock
      fixture.state.mode = 'READWRITE';
    });

    test('calls onSuccess callback which shows toast and navigates', async () => {
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaModePage />);

      await user.click(await screen.findByTestId('edit-mode-save-btn'));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Mode updated to READWRITE');
      });
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({ to: '/schema-registry' });
      });
    });

    test('calls onError callback which shows error toast', async () => {
      fixture.write.mockResolvedValue(new Response('Server error', { status: 500 }));
      const user = userEvent.setup();
      renderWithFileRoutes(<EditSchemaModePage />);

      await user.click(await screen.findByTestId('edit-mode-save-btn'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to update mode', { description: 'Error: Server error' });
      });
    });
  });
});
