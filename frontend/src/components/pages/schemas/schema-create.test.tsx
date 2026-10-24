import { afterEach, beforeEach, expect, rs, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { act, cleanup, render, screen } from 'test-utils';

import { SchemaCreatePage } from './schema-create';
import { useApiStore } from '../../../state/backend-api';

rs.mock('../../../react-query/api/schema-registry', () => ({
  ...rs.requireActual<typeof import('../../../react-query/api/schema-registry')>(
    '../../../react-query/api/schema-registry'
  ),
  useSchemaTypesQuery: () => ({ data: ['AVRO'] }),
  useSchemaRegistryContextsQuery: () => ({ data: [] }),
  useListSchemasQuery: () => ({ data: [] }),
}));

const initialApiState = useApiStore.getState();

beforeEach(() => {
  useApiStore.setState({
    schemaSubjects: undefined,
    refreshSchemaSubjects: rs.fn(),
    refreshSchemaTypes: rs.fn(),
    refreshTopics: rs.fn(),
  });
});

afterEach(() => {
  // Unmount first: re-rendered on the restored store, the page requests schema details through the
  // real API, which the harness rejects as an unexpected request.
  cleanup();
  useApiStore.setState(initialApiState, true);
});

// The page asks for the subjects on open, so they usually arrive after the reference row exists.
test('offers subjects that load after a reference was added', async () => {
  const user = userEvent.setup();
  render(<SchemaCreatePage matchedPath="/schema-registry/create" />);
  await user.click(screen.getByRole('button', { name: 'Add reference' }));

  act(() => {
    useApiStore.setState({
      schemaSubjects: [
        { name: 'orders-value', isSoftDeleted: false },
        { name: 'retired-value', isSoftDeleted: true },
      ],
    });
  });
  await user.click(screen.getByTestId('schema-create-reference-subject-select-0'));

  expect(await screen.findByRole('option', { name: 'orders-value' })).toBeVisible();
  expect(screen.queryByRole('option', { name: 'retired-value' })).not.toBeInTheDocument();
});
