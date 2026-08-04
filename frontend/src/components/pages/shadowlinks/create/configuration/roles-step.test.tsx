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

import { zodResolver } from '@hookform/resolvers/zod';
import userEvent from '@testing-library/user-event';
import { Form } from 'components/redpanda-ui/components/form';
import { FilterType, PatternType } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useForm } from 'react-hook-form';
import { useSupportedFeaturesStore } from 'state/supported-features';
import { render, screen, waitFor } from 'test-utils';

import { RolesStep } from './roles-step';
import { setShadowLinkGatesSupported } from '../../shadowlink-test-helpers';
import { FormSchema, type FormValues, initialValues } from '../model';

const ROLE_FILTER_PATTERN = /^role-filter-\d+$/;

const TestWrapper = ({ defaultValues = initialValues }: { defaultValues?: FormValues }) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form>
        <RolesStep />
      </form>
    </Form>
  );
};

describe('RolesStep', () => {
  beforeEach(() => {
    // Reset the shared store, then open the role sync gate, these tests
    // exercise the card itself, which only renders on Redpanda >= 26.2.0.
    useSupportedFeaturesStore.setState({ endpointCompatibility: null, shadowLinkRoleSync: false });
    setShadowLinkGatesSupported({ roleSync: true });
  });

  describe('Feature gate', () => {
    test('should render nothing when the cluster does not support role sync', () => {
      setShadowLinkGatesSupported({ roleSync: false });

      render(<TestWrapper />);

      expect(screen.queryByTestId('roles-toggle-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('roles-all-tab')).not.toBeInTheDocument();
    });

    test('should render nothing when endpoint compatibility has not loaded (fails closed)', () => {
      useSupportedFeaturesStore.setState({ endpointCompatibility: null, shadowLinkRoleSync: false });

      render(<TestWrapper />);

      expect(screen.queryByTestId('roles-toggle-button')).not.toBeInTheDocument();
    });
  });

  describe('Filter type options', () => {
    test('should show all filter type options when in specify roles mode', async () => {
      const user = userEvent.setup();
      const customValues: FormValues = {
        ...initialValues,
        rolesMode: 'specify',
        roles: [
          {
            name: '',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      render(<TestWrapper defaultValues={customValues} />);

      // Need to open the collapsible to see the editable filters
      const toggleButton = screen.getByTestId('roles-toggle-button');
      await user.click(toggleButton);

      await waitFor(() => {
        expect(screen.getByTestId('role-filter-0')).toBeInTheDocument();
      });

      // Verify all filter type tabs are present
      expect(screen.getByTestId('role-filter-0-include-specific')).toBeInTheDocument();
      expect(screen.getByTestId('role-filter-0-include-prefix')).toBeInTheDocument();
      expect(screen.getByTestId('role-filter-0-exclude-specific')).toBeInTheDocument();
      expect(screen.getByTestId('role-filter-0-exclude-prefix')).toBeInTheDocument();

      // Verify the text content of the tabs
      expect(screen.getByTestId('role-filter-0-include-specific')).toHaveTextContent('Include specific roles');
      expect(screen.getByTestId('role-filter-0-include-prefix')).toHaveTextContent('Include starting with');
      expect(screen.getByTestId('role-filter-0-exclude-specific')).toHaveTextContent('Exclude specific');
      expect(screen.getByTestId('role-filter-0-exclude-prefix')).toHaveTextContent('Exclude starting with');
    });

    test('should switch the name placeholder between specific and prefix tabs', async () => {
      const user = userEvent.setup();
      const customValues: FormValues = {
        ...initialValues,
        rolesMode: 'specify',
        roles: [
          {
            name: '',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      render(<TestWrapper defaultValues={customValues} />);

      // Need to open the collapsible to see the editable filters
      const toggleButton = screen.getByTestId('roles-toggle-button');
      await user.click(toggleButton);

      await waitFor(() => {
        expect(screen.getByTestId('role-filter-0-name')).toHaveAttribute('placeholder', 'my-role');
      });

      await user.click(screen.getByTestId('role-filter-0-include-prefix'));

      await waitFor(() => {
        expect(screen.getByTestId('role-filter-0-name')).toHaveAttribute('placeholder', 'prefix-');
      });

      await user.click(screen.getByTestId('role-filter-0-exclude-specific'));

      await waitFor(() => {
        expect(screen.getByTestId('role-filter-0-name')).toHaveAttribute('placeholder', 'my-role');
      });
    });
  });

  describe('Mode toggle', () => {
    test('should seed one empty filter when switching from all to specify mode', async () => {
      const user = userEvent.setup();

      // initialValues default to rolesMode 'all' with no filters
      render(<TestWrapper />);

      await user.click(screen.getByTestId('roles-specify-tab'));

      // Switching auto-expands the card and appends a single empty filter
      await waitFor(() => {
        expect(screen.getByTestId('role-filter-0-name')).toHaveValue('');
      });
      expect(screen.getAllByTestId(ROLE_FILTER_PATTERN)).toHaveLength(1);
    });

    test('should clear filters when switching to all mode and reseed on return', async () => {
      const user = userEvent.setup();
      const customValues: FormValues = {
        ...initialValues,
        rolesMode: 'specify',
        roles: [
          {
            name: 'role-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
          {
            name: 'role-2',
            patternType: PatternType.PREFIX,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      render(<TestWrapper defaultValues={customValues} />);

      const toggleButton = screen.getByTestId('roles-toggle-button');
      await user.click(toggleButton);

      await waitFor(() => {
        expect(screen.getAllByTestId(ROLE_FILTER_PATTERN)).toHaveLength(2);
      });

      // Switching to all discards the filter list entirely
      await user.click(screen.getByTestId('roles-all-tab'));

      await waitFor(() => {
        expect(screen.queryAllByTestId(ROLE_FILTER_PATTERN)).toHaveLength(0);
      });

      // Coming back to specify seeds a single empty filter, not the old list
      await user.click(screen.getByTestId('roles-specify-tab'));

      await waitFor(() => {
        expect(screen.getByTestId('role-filter-0-name')).toHaveValue('');
      });
      expect(screen.getAllByTestId(ROLE_FILTER_PATTERN)).toHaveLength(1);
    });
  });

  describe('Multiple filters', () => {
    test('should create multiple role filters', async () => {
      const user = userEvent.setup();
      const customValues: FormValues = {
        ...initialValues,
        rolesMode: 'specify',
        roles: [
          {
            name: '',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      render(<TestWrapper defaultValues={customValues} />);

      // Need to open the collapsible to see the editable filters
      const toggleButton = screen.getByTestId('roles-toggle-button');
      await user.click(toggleButton);

      await waitFor(() => {
        expect(screen.getByTestId('role-filter-0')).toBeInTheDocument();
      });

      // Add second filter
      const addButton = screen.getByTestId('add-role-filter-button');
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByTestId('role-filter-1')).toBeInTheDocument();
      });

      // Verify both filters exist
      expect(screen.getByTestId('role-filter-0')).toBeInTheDocument();
      expect(screen.getByTestId('role-filter-1')).toBeInTheDocument();
    });
  });

  describe('Deleting filters', () => {
    test('should delete role filters', async () => {
      const user = userEvent.setup();
      const customValues: FormValues = {
        ...initialValues,
        rolesMode: 'specify',
        roles: [
          {
            name: 'role-1',
            patternType: PatternType.LITERAL,
            filterType: FilterType.INCLUDE,
          },
          {
            name: 'role-2',
            patternType: PatternType.PREFIX,
            filterType: FilterType.INCLUDE,
          },
        ],
      };

      render(<TestWrapper defaultValues={customValues} />);

      // Need to open the collapsible to see the editable filters
      const toggleButton = screen.getByTestId('roles-toggle-button');
      await user.click(toggleButton);

      await waitFor(() => {
        expect(screen.getByTestId('role-filter-0')).toBeInTheDocument();
        expect(screen.getByTestId('role-filter-1')).toBeInTheDocument();
      });

      // Delete the first filter
      const deleteButton = screen.getByTestId('role-filter-0-delete');
      await user.click(deleteButton);

      await waitFor(() => {
        // The second filter should now be at index 0
        expect(screen.getByTestId('role-filter-0')).toBeInTheDocument();
        // The old filter at index 1 should not exist anymore
        expect(screen.queryByTestId('role-filter-1')).not.toBeInTheDocument();
      });

      // Verify only one filter remains
      expect(screen.getAllByTestId(ROLE_FILTER_PATTERN)).toHaveLength(1);
    });
  });
});
