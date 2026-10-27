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

import { TopicsStep } from './topics-step';
import { FormSchema, type FormValues, initialValues } from '../model';

const TOPIC_FILTER_PATTERN = /^topic-filter-\d+$/;

const TestWrapper = ({ defaultValues = initialValues }: { defaultValues?: FormValues }) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form>
        <TopicsStep />
      </form>
    </Form>
  );
};

/** Renders the step in "specify" mode with the given filters, expanded so the editable filters show. */
const renderExpandedTopicsStep = async (topics: FormValues['topics']) => {
  const user = userEvent.setup();
  render(<TestWrapper defaultValues={{ ...initialValues, topicsMode: 'specify', topics }} />);

  // Need to open the collapsible to see the editable filters
  await user.click(screen.getByTestId('topics-toggle-button'));
  return user;
};

describe('the TopicsStep', () => {
  describe('multiple filters', () => {
    test('should create multiple topic filters', async () => {
      const user = await renderExpandedTopicsStep([
        {
          name: '',
          patternType: PatternType.LITERAL,
          filterType: FilterType.INCLUDE,
        },
      ]);

      await waitFor(() => {
        expect(screen.getByTestId('topic-filter-0')).toBeInTheDocument();
      });

      // Add second filter
      const addButton = screen.getByTestId('add-topic-filter-button');
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByTestId('topic-filter-1')).toBeInTheDocument();
      });

      // Verify both filters exist
      expect(screen.getByTestId('topic-filter-0')).toBeInTheDocument();
      expect(screen.getByTestId('topic-filter-1')).toBeInTheDocument();
    });
  });

  describe('deleting filters', () => {
    test('should delete topic filters', async () => {
      const user = await renderExpandedTopicsStep([
        {
          name: 'topic-1',
          patternType: PatternType.LITERAL,
          filterType: FilterType.INCLUDE,
        },
        {
          name: 'topic-2',
          patternType: PatternType.PREFIX,
          filterType: FilterType.INCLUDE,
        },
      ]);

      await waitFor(() => {
        expect(screen.getByTestId('topic-filter-0')).toBeInTheDocument();
        expect(screen.getByTestId('topic-filter-1')).toBeInTheDocument();
      });

      // Delete the first filter
      const deleteButton = screen.getByTestId('topic-filter-0-delete');
      await user.click(deleteButton);

      await waitFor(() => {
        // The second filter should now be at index 0
        expect(screen.getByTestId('topic-filter-0')).toBeInTheDocument();
        // The old filter at index 1 should not exist anymore
        expect(screen.queryByTestId('topic-filter-1')).not.toBeInTheDocument();
      });

      // Verify only one filter remains
      expect(screen.getAllByTestId(TOPIC_FILTER_PATTERN)).toHaveLength(1);
    });
  });
});
