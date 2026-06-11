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
import { render, screen } from 'test-utils';
import { describe, expect, test, vi } from 'vitest';

import { SqlWizard, type SqlWizardProps, type WizardTopic } from './sql-wizard';

vi.mock('components/redpanda-ui/components/code-block-dynamic', () => ({
  SyncCodeBlock: ({ code }: { code: string }) => <div data-testid="sql-preview">{code}</div>,
}));

const TOPICS: WizardTopic[] = [
  { name: 'orders', partitions: 12, format: 'AVRO' },
  { name: 'cars-telemetry.v1', partitions: 3, iceberg: true },
];

const renderWizard = (overrides: Partial<SqlWizardProps> = {}) => {
  const props: SqlWizardProps = {
    topics: TOPICS,
    onClose: vi.fn(),
    onCreate: vi.fn(),
    ...overrides,
  };
  render(<SqlWizard {...props} />);
  return props;
};

const pickTopicAndContinue = async (topicName: string) => {
  await userEvent.click(screen.getByRole('radio', { name: new RegExp(topicName) }));
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
};

describe('SqlWizard', () => {
  test('lists topics with details and filters them by search', async () => {
    renderWizard();

    expect(screen.getByRole('radio', { name: /orders/ })).toBeInTheDocument();
    expect(screen.getByText('12 partitions · AVRO')).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText('Search topics'), 'cars');

    expect(screen.queryByRole('radio', { name: /orders/ })).toBeNull();
    expect(screen.getByRole('radio', { name: /cars-telemetry/ })).toBeInTheDocument();
  });

  test('shows an empty message when no topic matches the search', async () => {
    renderWizard();

    await userEvent.type(screen.getByPlaceholderText('Search topics'), 'nope');

    expect(screen.getByText('No topics found.')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  test('continue is disabled until a topic is selected', async () => {
    renderWizard();

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    await userEvent.click(screen.getByRole('radio', { name: /orders/ }));

    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  test('prefills a sanitized table name from the topic and previews the SQL', async () => {
    renderWizard();

    await pickTopicAndContinue('cars-telemetry');

    expect(screen.getByLabelText('Table name')).toHaveValue('cars_telemetry_v1');
    expect(screen.getByTestId('sql-preview')).toHaveTextContent(
      "CREATE TABLE default_redpanda_catalog=>cars_telemetry_v1 WITH (topic='cars-telemetry.v1');"
    );
  });

  test('rejects an invalid table name and does not create', async () => {
    const { onCreate } = renderWizard();

    await pickTopicAndContinue('orders');
    await userEvent.clear(screen.getByLabelText('Table name'));
    await userEvent.type(screen.getByLabelText('Table name'), 'Bad Name');
    await userEvent.click(screen.getByRole('button', { name: /Create table/ }));

    expect(screen.getByText(/Use lowercase letters, numbers and underscores/)).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  test('creates the table with the chosen topic and edited name', async () => {
    const { onCreate } = renderWizard();

    await pickTopicAndContinue('orders');
    await userEvent.clear(screen.getByLabelText('Table name'));
    await userEvent.type(screen.getByLabelText('Table name'), 'orders_table');
    await userEvent.click(screen.getByRole('button', { name: /Create table/ }));

    expect(onCreate).toHaveBeenCalledWith({ topic: 'orders', tableName: 'orders_table' });
  });

  test('shows the iceberg badge and bridged-query notice for iceberg topics', async () => {
    renderWizard();

    expect(screen.getByTitle('Iceberg tiering enabled')).toBeInTheDocument();

    await pickTopicAndContinue('cars-telemetry');

    expect(screen.getByText(/Queries are/)).toBeInTheDocument();
    expect(screen.getByText(/bridged/)).toBeInTheDocument();
  });

  test('renders the creation error from the parent', async () => {
    renderWizard({ error: 'table already exists' });

    await pickTopicAndContinue('orders');

    expect(screen.getByRole('alert')).toHaveTextContent('table already exists');
  });

  test('close button calls onClose', async () => {
    const { onClose } = renderWizard();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
  });
});
