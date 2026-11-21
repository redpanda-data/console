import { afterEach, beforeEach, expect, rs, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';

import { createSchemaRegistryFixture, createSchemaSubject } from './__fixtures__/schema-registry';
import { SchemaCreatePage } from './schema-create';
import { useApiStore } from '../../../state/backend-api';
import { act, cleanup, render, screen } from '../../../test-utils';

const initialApiState = useApiStore.getState();

beforeEach(() => {
  const fixture = createSchemaRegistryFixture();
  rs.spyOn(globalThis, 'fetch').mockImplementation(fixture.fetch);
  useApiStore.setState({
    schemaSubjects: undefined,
    schemaDetails: new Map(),
    refreshSchemaSubjects: rs.fn(),
    refreshSchemaTypes: rs.fn(),
    refreshTopics: rs.fn().mockResolvedValue(undefined),
  });
});

afterEach(() => {
  // Unmount first: re-rendered on the restored store, the page requests schema details through the
  // real API, which the harness rejects as an unexpected request.
  cleanup();
  useApiStore.setState(initialApiState, true);
  rs.restoreAllMocks();
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

// Populate both active versions, matching a subject with an earlier and a latest schema.
function installReferenceVersions() {
  const details = createSchemaSubject('orders-value');
  details.latestActiveVersion = 2;
  details.versions.push({ version: 2, isSoftDeleted: false });
  details.schemas.push({ ...details.schemas[0], version: 2, id: 2 });
  useApiStore.setState({
    schemaSubjects: [{ name: details.name, isSoftDeleted: false }],
    schemaDetails: new Map([[details.name, details]]),
  });
}

// A reference defaults to the latest version, but users can pin an earlier numeric version.
test('changes the selected schema reference version', async () => {
  installReferenceVersions();
  const user = userEvent.setup();
  render(<SchemaCreatePage matchedPath="/schema-registry/create" />);
  await user.click(screen.getByTestId('schema-create-reference-subject-select-0'));
  await user.click(await screen.findByRole('option', { name: 'orders-value' }));
  expect(screen.getByTestId('schema-create-reference-version-select-0')).toHaveTextContent('2');

  await user.click(screen.getByTestId('schema-create-reference-version-select-0'));
  await user.click(await screen.findByRole('option', { name: '1' }));
  expect(screen.getByTestId('schema-create-reference-version-select-0')).toHaveTextContent('1');
});
