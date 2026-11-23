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
import type {
  SchemaRegistryConfigResponse,
  SchemaRegistryModeResponse,
  SchemaRegistrySetCompatibilityModeRequest,
  SchemaRegistrySubjectDetails,
  UserData,
} from 'state/rest-interfaces';
import { useSupportedFeaturesStore } from 'state/supported-features';
import { cleanup, renderWithFileRoutes, screen, waitFor } from 'test-utils';

import EditSchemaCompatibilityPage from './edit-compatibility';
import type { SchemaEditTarget } from './schema-edit-page';

const SUBJECT = 'team/orders-value';
const CONTEXT = '.staging';
const SUBJECT_PATH = '/subjects/team%2Forders-value/versions/all';
const CONTEXT_CONFIG_PATH = '/config/%3A.staging%3A';
const GLOBAL_CONFIG = { compatibility: 'BACKWARD' } satisfies SchemaRegistryConfigResponse;
const GLOBAL_MODE = { mode: 'READWRITE' } satisfies SchemaRegistryModeResponse;
const SUBJECT_DETAILS = {
  name: SUBJECT,
  type: 'AVRO',
  compatibility: 'FORWARD',
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
  { name: CONTEXT, mode: 'READWRITE', compatibility: 'FULL' },
] satisfies SchemaRegistryContextResponse[];
const DEFAULT_RADIO = /^Default /u;

const schemaApi = new URL(`${config.restBasePath}/schema-registry`, window.location.href).href;
const server = setupServer(
  http.get(`${schemaApi}/mode`, () => HttpResponse.json(GLOBAL_MODE)),
  http.get(`${schemaApi}/config`, () => HttpResponse.json(GLOBAL_CONFIG)),
  http.get(`${schemaApi}${SUBJECT_PATH}`, () => HttpResponse.json(SUBJECT_DETAILS)),
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
      <EditSchemaCompatibilityPage {...target} />
    </>,
    { initialLocation: `/schema-registry${editPath}/edit-compatibility` }
  );
}

const scenarios = [
  {
    label: 'global',
    target: {},
    initial: /^Backward /u,
    endpoint: '/config',
    nextChoice: null,
    nextMode: 'BACKWARD',
    destination: '/schema-registry',
    subject: undefined,
    context: undefined,
  },
  {
    label: 'subject',
    target: { subjectName: 'team%2Forders-value' },
    initial: /^Forward /u,
    endpoint: '/config/team%2Forders-value',
    nextChoice: /^Transitive Full /u,
    nextMode: 'FULL_TRANSITIVE',
    destination: '/schema-registry/subjects/team%2Forders-value',
    subject: SUBJECT,
    context: undefined,
  },
  {
    label: 'context',
    target: { contextName: CONTEXT },
    initial: /^Full /u,
    endpoint: CONTEXT_CONFIG_PATH,
    nextChoice: /^Transitive Forward /u,
    nextMode: 'FORWARD_TRANSITIVE',
    destination: '/schema-registry?context=.staging',
    subject: undefined,
    context: `Editing compatibility for context: ${CONTEXT}`,
  },
] as const;

test.each(scenarios)('shows the current $label compatibility and its scope', async (scenario) => {
  renderEditor(scenario.target);

  expect(await screen.findByRole('radio', { name: scenario.initial })).toBeChecked();
  expect(screen.queryByTestId('edit-compatibility-subject-name')?.textContent).toBe(scenario.subject);
  expect(screen.queryByTestId('edit-compatibility-context-name')?.textContent).toBe(scenario.context);
});

test.each(scenarios)('saves $label compatibility and returns to its page', async (scenario) => {
  const user = userEvent.setup();
  const writes: unknown[] = [];
  const { router } = renderEditor(scenario.target, [
    http.put(`${schemaApi}${scenario.endpoint}`, async ({ request }) => {
      writes.push(await request.json());
      return HttpResponse.json({
        compatibility: scenario.nextMode,
      } satisfies SchemaRegistrySetCompatibilityModeRequest);
    }),
  ]);

  const save = await screen.findByRole('button', { name: 'Save' });
  if (scenario.nextChoice) {
    await user.click(screen.getByRole('radio', { name: scenario.nextChoice }));
  }
  await user.click(save);

  expect(await screen.findByText(`Compatibility mode updated to ${scenario.nextMode}`)).toBeInTheDocument();
  expect(writes).toEqual([{ compatibility: scenario.nextMode }]);
  await waitFor(() => expect(router.state.location.href).toBe(scenario.destination));
});

test.each(scenarios)('cancels the $label edit without saving', async (scenario) => {
  const user = userEvent.setup();
  const { router } = renderEditor(scenario.target);

  await user.click(await screen.findByRole('button', { name: 'Cancel' }));

  await waitFor(() => expect(router.state.location.href).toBe(scenario.destination));
});

test('resets a context to the global default when its compatibility is unset', async () => {
  const user = userEvent.setup();
  const writes: (ReadableStream | null)[] = [];
  renderEditor({ contextName: CONTEXT }, [
    http.get(`${schemaApi}/contexts`, () => HttpResponse.json([{ name: CONTEXT, mode: 'READWRITE' }])),
    http.delete(`${schemaApi}${CONTEXT_CONFIG_PATH}`, ({ request }) => {
      writes.push(request.body);
      return HttpResponse.json(null);
    }),
  ]);

  expect(await screen.findByRole('radio', { name: DEFAULT_RADIO })).toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('Compatibility mode updated to DEFAULT')).toBeInTheDocument();
  expect(writes).toEqual([null]);
});

test('shows the server error and stays on the edit page if a context update fails', async () => {
  const user = userEvent.setup();
  const { router } = renderEditor({ contextName: CONTEXT }, [
    http.put(`${schemaApi}${CONTEXT_CONFIG_PATH}`, () =>
      HttpResponse.text('Registry refused this update', { status: 502 })
    ),
  ]);
  const editPage = router.state.location.href;

  await user.click(await screen.findByRole('button', { name: 'Save' }));

  expect(await screen.findByText('Failed to update compatibility mode')).toBeInTheDocument();
  expect(screen.getByText('Error: Registry refused this update')).toBeInTheDocument();
  expect(router.state.location.href).toBe(editPage);
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
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
  { label: 'compatibility', target: {}, endpoint: '/config', data: GLOBAL_CONFIG },
  {
    label: 'subject details',
    target: { subjectName: 'team%2Forders-value' },
    endpoint: SUBJECT_PATH,
    data: SUBJECT_DETAILS,
  },
  { label: 'contexts', target: { contextName: CONTEXT }, endpoint: '/contexts', data: CONTEXT_DETAILS },
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
