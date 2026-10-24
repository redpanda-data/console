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

import { zodResolver } from '@hookform/resolvers/zod';
import userEvent from '@testing-library/user-event';
import { Form } from 'components/redpanda-ui/components/form';
import { FilterType, PatternType } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useForm } from 'react-hook-form';
import { render, screen, waitFor } from 'test-utils';

import { ConsumerOffsetStep } from './consumer-offset-step';
import { FormSchema, type FormValues, initialValues } from '../model';

const CONSUMER_FILTER_PATTERN = /^consumer-filter-\d+$/;

const TestWrapper = ({ defaultValues = initialValues }: { defaultValues?: FormValues }) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form>
        <ConsumerOffsetStep />
      </form>
    </Form>
  );
};

/** Renders the step in "specify" mode with the given filters, expanded so the editable filters show. */
const renderExpandedConsumerOffsetStep = async (consumers: FormValues['consumers']) => {
  const user = userEvent.setup();
  render(<TestWrapper defaultValues={{ ...initialValues, consumersMode: 'specify', consumers }} />);

  // Need to open the collapsible to see the editable filters
  await user.click(screen.getByTestId('consumers-toggle-button'));
  return user;
};

describe('the ConsumerOffsetStep', () => {
  describe('filter type options', () => {
    test('should show all filter type options when in specify consumer groups mode', async () => {
      await renderExpandedConsumerOffsetStep([
        {
          name: '',
          patternType: PatternType.LITERAL,
          filterType: FilterType.INCLUDE,
        },
      ]);

      await waitFor(() => {
        expect(screen.getByTestId('consumer-filter-0')).toBeInTheDocument();
      });

      // Verify all filter type tabs are present
      expect(screen.getByTestId('consumer-filter-0-include-specific')).toBeInTheDocument();
      expect(screen.getByTestId('consumer-filter-0-include-prefix')).toBeInTheDocument();
      expect(screen.getByTestId('consumer-filter-0-exclude-specific')).toBeInTheDocument();
      expect(screen.getByTestId('consumer-filter-0-exclude-prefix')).toBeInTheDocument();

      // Verify the text content of the tabs
      expect(screen.getByTestId('consumer-filter-0-include-specific')).toHaveTextContent(
        'Include specific consumer groups'
      );
      expect(screen.getByTestId('consumer-filter-0-include-prefix')).toHaveTextContent('Include starting with');
      expect(screen.getByTestId('consumer-filter-0-exclude-specific')).toHaveTextContent('Exclude specific');
      expect(screen.getByTestId('consumer-filter-0-exclude-prefix')).toHaveTextContent('Exclude starting with');
    });
  });

  describe('multiple filters', () => {
    test('should create multiple consumer filters', async () => {
      const user = await renderExpandedConsumerOffsetStep([
        {
          name: '',
          patternType: PatternType.LITERAL,
          filterType: FilterType.INCLUDE,
        },
      ]);

      await waitFor(() => {
        expect(screen.getByTestId('consumer-filter-0')).toBeInTheDocument();
      });

      // Add second filter
      const addButton = screen.getByTestId('add-consumer-filter-button');
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByTestId('consumer-filter-1')).toBeInTheDocument();
      });

      // Verify both filters exist
      expect(screen.getByTestId('consumer-filter-0')).toBeInTheDocument();
      expect(screen.getByTestId('consumer-filter-1')).toBeInTheDocument();
    });
  });

  describe('deleting filters', () => {
    test('should delete consumer filters', async () => {
      const user = await renderExpandedConsumerOffsetStep([
        {
          name: 'consumer-1',
          patternType: PatternType.LITERAL,
          filterType: FilterType.INCLUDE,
        },
        {
          name: 'consumer-2',
          patternType: PatternType.PREFIX,
          filterType: FilterType.INCLUDE,
        },
      ]);

      await waitFor(() => {
        expect(screen.getByTestId('consumer-filter-0')).toBeInTheDocument();
        expect(screen.getByTestId('consumer-filter-1')).toBeInTheDocument();
      });

      // Delete the first filter
      const deleteButton = screen.getByTestId('consumer-filter-0-delete');
      await user.click(deleteButton);

      await waitFor(() => {
        // The second filter should now be at index 0
        expect(screen.getByTestId('consumer-filter-0')).toBeInTheDocument();
        // The old filter at index 1 should not exist anymore
        expect(screen.queryByTestId('consumer-filter-1')).not.toBeInTheDocument();
      });

      // Verify only one filter remains
      expect(screen.getAllByTestId(CONSUMER_FILTER_PATTERN)).toHaveLength(1);
    });
  });
});
