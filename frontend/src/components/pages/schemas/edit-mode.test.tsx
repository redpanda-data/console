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

import { afterAll, afterEach, beforeAll, expect, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { config } from 'config';
import { type HttpHandler, HttpResponse, http } from 'msw';
import { HttpNetworkFrame } from 'msw/experimental';
import { setupServer } from 'msw/node';
import { AuthenticationMethod } from 'protogen/redpanda/api/console/v1alpha1/authentication_pb';
import type { SchemaRegistryContextResponse } from 'react-query/api/schema-registry';
import { Toaster } from 'sonner';
import { useApiStore } from 'state/backend-api';
import type { SchemaRegistryModeResponse, SchemaRegistrySubjectDetails, UserData } from 'state/rest-interfaces';
import { useSupportedFeaturesStore } from 'state/supported-features';
import { cleanup, renderWithFileRoutes, screen, waitFor } from 'test-utils';

import EditSchemaModePage from './edit-mode';
import type { SchemaEditTarget } from './schema-edit-page';

const SUBJECT = 'orders-value';
const CONTEXT = '.staging';
const GLOBAL_MODE = { mode: 'READWRITE' } satisfies SchemaRegistryModeResponse;
const SUBJECT_DETAILS = {
  name: SUBJECT,
  type: 'AVRO',
  compatibility: 'BACKWARD',
  mode: 'READWRITE',
  versions: [{ version: 1, isSoftDeleted: false }],
  latestActiveVersion: 1,
  schemas: [
    {
      id: 1,
      version: 1,
      type: 'AVRO',
      schema: '{"type":"record","name":"Order","fields":[]}',
      isSoftDeleted: false,
      references: [],
    },
  ],
} satisfies SchemaRegistrySubjectDetails;

const CONTEXT_DETAILS = [
  { name: CONTEXT, mode: 'IMPORT', compatibility: 'BACKWARD' },
] satisfies SchemaRegistryContextResponse[];
const READ_WRITE_RADIO = /^Read\/Write /u;
const READ_ONLY_RADIO = /^Read Only /u;
const IMPORT_RADIO = /^Import /u;
const DEFAULT_RADIO = /^Default /u;

const schemaApi = new URL(`${config.restBasePath}/schema-registry`, window.location.href).href;
const server = setupServer(
  http.get(`${schemaApi}/mode`, () => HttpResponse.json(GLOBAL_MODE)),
  http.get(`${schemaApi}/subjects/orders-value/versions/all`, () => HttpResponse.json(SUBJECT_DETAILS)),
  http.get(`${schemaApi}/contexts`, () => HttpResponse.json(CONTEXT_DETAILS))
);

const guardedFetch = globalThis.fetch;
const initialUserData = useApiStore.getState().userData;
const initialContexts = useSupportedFeaturesStore.getState().schemaRegistryContexts;

beforeAll(() => {
  server.listen({
    async onUnhandledFrame({ frame }) {
      if (frame instanceof HttpNetworkFrame) {
        await guardedFetch(frame.data.request);
      }
      throw new Error('Unexpected network frame in the schema editor');
    },
  });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  useApiStore.setState({ userData: initialUserData });
  useSupportedFeaturesStore.setState({ schemaRegistryContexts: initialContexts });
});

afterAll(() => {
  server.close();
});

function renderEditor(target: SchemaEditTarget = {}, handlers: HttpHandler[] = [], contextsSupported = true) {
  useSupportedFeaturesStore.setState({ schemaRegistryContexts: contextsSupported });
  server.use(...handlers);

  let editPath = '';
  if (target.subjectName) {
    editPath = `/subjects/${target.subjectName}`;
  } else if (target.contextName) {
    editPath = `/contexts/${target.contextName}`;
  }
  return renderWithFileRoutes(
    <>
      <Toaster />
      <EditSchemaModePage {...target} />
    </>,
    { initialLocation: `/schema-registry${editPath}/edit-mode` }
  );
}

test('only offers explicit modes when editing the global setting', async () => {
  renderEditor();

  expect(await screen.findByRole('radio', { name: READ_WRITE_RADIO })).toBeChecked();
  expect(screen.getByRole('radio', { name: IMPORT_RADIO })).toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: DEFAULT_RADIO })).not.toBeInTheDocument();
  expect(screen.queryByTestId('edit-mode-subject-name')).not.toBeInTheDocument();
});

test('offers Default and a schema preview when editing a subject', async () => {
  renderEditor({ subjectName: SUBJECT });

  expect(await screen.findByRole('radio', { name: READ_WRITE_RADIO })).toBeChecked();
  expect(screen.getByRole('radio', { name: READ_ONLY_RADIO })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: IMPORT_RADIO })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Default Use the globally configured default mode.' })).toBeInTheDocument();
  expect(screen.getByTestId('edit-mode-subject-name')).toHaveTextContent(SUBJECT);
});

test.each([
  { mode: 'READWRITE', choice: null },
  { mode: 'READONLY', choice: READ_ONLY_RADIO },
])('saves $mode globally and returns to the registry', async ({ mode, choice }) => {
  const user = userEvent.setup();
  const writes: unknown[] = [];
  const { router } = renderEditor({}, [
    http.put(`${schemaApi}/mode`, async ({ request }) => {
      writes.push(await request.json());
      return HttpResponse.json({ mode } satisfies SchemaRegistryModeResponse);
    }),
  ]);

  const save = await screen.findByRole('button', { name: 'Save' });

  if (choice) {
    await user.click(screen.getByRole('radio', { name: choice }));
  }
  await user.click(save);

  expect(await screen.findByText(`Mode updated to ${mode}`)).toBeInTheDocument();
  expect(writes).toEqual([{ mode }]);
  await waitFor(() => expect(router.state.location.href).toBe('/schema-registry'));
});

test('saves the current subject mode, not the global mode', async () => {
  const user = userEvent.setup();
  const writes: unknown[] = [];
  const { router } = renderEditor({ subjectName: SUBJECT }, [
    http.get(`${schemaApi}/mode`, () => HttpResponse.json({ mode: 'READONLY' } satisfies SchemaRegistryModeResponse)),
    http.put(`${schemaApi}/mode/orders-value`, async ({ request }) => {
      writes.push(await request.json());
      return HttpResponse.json(GLOBAL_MODE);
    }),
  ]);

  expect(await screen.findByRole('radio', { name: READ_WRITE_RADIO })).toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(router.state.location.href).toBe('/schema-registry/subjects/orders-value'));
  expect(writes).toEqual([{ mode: 'READWRITE' }]);
});

test('resets the subject mode to the global default', async () => {
  const user = userEvent.setup();
  const writes: (ReadableStream | null)[] = [];
  const { router } = renderEditor({ subjectName: SUBJECT }, [
    http.delete(`${schemaApi}/mode/orders-value`, ({ request }) => {
      writes.push(request.body);
      return HttpResponse.json(null);
    }),
  ]);

  await user.click(await screen.findByRole('radio', { name: DEFAULT_RADIO }));
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(router.state.location.href).toBe('/schema-registry/subjects/orders-value'));
  expect(writes).toEqual([null]);
});

test.each([
  { label: 'global', target: {}, destination: '/schema-registry' },
  { label: 'subject', target: { subjectName: SUBJECT }, destination: '/schema-registry/subjects/orders-value' },
])('cancels the $label edit without saving', async ({ target, destination }) => {
  const user = userEvent.setup();
  const { router } = renderEditor(target);

  await user.click(await screen.findByRole('button', { name: 'Cancel' }));

  await waitFor(() => expect(router.state.location.href).toBe(destination));
});

test('shows the context name and current mode', async () => {
  renderEditor({ contextName: CONTEXT });

  expect(await screen.findByTestId('edit-mode-context-name')).toHaveTextContent(CONTEXT);
  expect(screen.getByRole('radio', { name: IMPORT_RADIO })).toBeChecked();
});

test('shows the unsupported page when contexts are disabled', async () => {
  renderEditor({ contextName: CONTEXT }, [], false);

  expect(await screen.findByTestId('contexts-not-supported')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
});

test('shows the not-configured page when the registry is disabled', async () => {
  renderEditor({}, [http.get(`${schemaApi}/mode`, () => HttpResponse.json({ isConfigured: false }))]);

  expect(await screen.findByTestId('schema-not-configured')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
});

test.each([
  { label: 'mode', target: {}, endpoint: '/mode', data: GLOBAL_MODE },
  {
    label: 'subject details',
    target: { subjectName: SUBJECT },
    endpoint: '/subjects/orders-value/versions/all',
    data: SUBJECT_DETAILS,
  },
] as const)('holds the form behind a skeleton while $label is loading', async ({ target, endpoint, data }) => {
  let requestStarted = false;
  const response = Promise.withResolvers<Response>();
  const { container, router } = renderEditor(target, [
    http.get(`${schemaApi}${endpoint}`, () => {
      requestStarted = true;
      return response.promise;
    }),
  ]);

  try {
    await waitFor(() => {
      expect(requestStarted).toBe(true);
      expect(router.options.context?.queryClient.isFetching()).toBe(1);
    });
    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  } finally {
    response.resolve(HttpResponse.json(data));
  }
  expect(await screen.findByRole('button', { name: 'Save' })).toBeEnabled();
});

test('shows the server error and stays on the edit page if the update fails', async () => {
  const user = userEvent.setup();
  const { router } = renderEditor({}, [
    http.put(`${schemaApi}/mode`, () => HttpResponse.text('Registry refused this update', { status: 502 })),
  ]);
  const editPage = router.state.location.href;

  await user.click(await screen.findByRole('button', { name: 'Save' }));

  expect(await screen.findByText('Failed to update mode')).toBeInTheDocument();
  expect(screen.getByText('Error: Registry refused this update')).toBeInTheDocument();
  expect(router.state.location.href).toBe(editPage);
});

test('disables Save for a user without registry management permission', async () => {
  const user: UserData = {
    displayName: 'Read-only operator',
    avatarUrl: '',
    authenticationMethod: AuthenticationMethod.UNSPECIFIED,
    canViewConsoleUsers: false,
    canListAcls: false,
    canListQuotas: false,
    canReassignPartitions: false,
    canPatchConfigs: false,
    canCreateRoles: false,
    canManageUsers: false,
    canViewPermissionsList: false,
    canManageLicense: false,
    canViewSchemas: true,
    canCreateSchemas: false,
    canDeleteSchemas: false,
    canManageSchemaRegistry: false,
    canViewDebugBundle: false,
    canListTransforms: false,
    canCreateTransforms: false,
    canDeleteTransforms: false,
  };
  useApiStore.setState({ userData: user });
  renderEditor();

  expect(await screen.findByRole('button', { name: 'Save' })).toBeDisabled();
});
