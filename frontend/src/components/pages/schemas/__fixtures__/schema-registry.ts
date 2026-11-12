import { rs } from '@rstest/core';

import { AuthenticationMethod } from '../../../../protogen/redpanda/api/console/v1alpha1/authentication_pb';
import type {
  SchemaRegistryCompatibilityModeWithDefault,
  SchemaRegistryModeWithDefault,
  SchemaRegistrySubject,
  SchemaRegistrySubjectDetails,
  SchemaTypeType,
  UserData,
} from '../../../../state/rest-interfaces';

export const createSchemaSubject = (name: string): SchemaRegistrySubjectDetails => ({
  name,
  type: 'AVRO',
  mode: 'READWRITE',
  compatibility: 'BACKWARD',
  latestActiveVersion: 1,
  versions: [{ version: 1, isSoftDeleted: false }],
  schemas: [
    {
      version: 1,
      id: 1,
      type: 'AVRO',
      schema: '{"type":"record","name":"Test","fields":[]}',
      isSoftDeleted: false,
      references: [],
    },
  ],
});

export const createSchemaRegistryUser = (canManageSchemaRegistry = true): UserData => ({
  displayName: '',
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
  canManageSchemaRegistry,
  canViewDebugBundle: false,
  canListTransforms: false,
  canCreateTransforms: false,
  canDeleteTransforms: false,
});

/** Fixture only at the HTTP boundary: query state, invalidation and callbacks stay real. */
export function createSchemaRegistryFixture() {
  const state: {
    mode: string | null;
    compatibility: string | null;
    details: SchemaRegistrySubjectDetails | undefined;
    subjects: SchemaRegistrySubject[];
    types: SchemaTypeType[];
    contexts: {
      name: string;
      mode?: SchemaRegistryModeWithDefault;
      compatibility?: SchemaRegistryCompatibilityModeWithDefault;
    }[];
  } = { mode: 'READWRITE', compatibility: 'BACKWARD', details: undefined, contexts: [], subjects: [], types: ['AVRO'] };
  const pending = new Set<string>();
  const write = rs.fn<(path: string, method: string, body: string | undefined) => Promise<Response>>(() =>
    Promise.resolve(Response.json({}))
  );
  const read = (path: string): Promise<Response> => {
    const key = path.startsWith('subjects/') ? 'details' : path === 'config' ? 'compatibility' : path;
    if (pending.has(key)) {
      // Deliberately unresolved until unmount: these cases verify the loading UI.
      return new Promise<Response>(() => {
        // Loading remains pending until the component is unmounted.
      });
    }
    switch (key) {
      case 'schemas/types':
        return Promise.resolve(Response.json({ schemaTypes: state.types }));
      case 'subjects':
        return Promise.resolve(Response.json(state.subjects));
      case 'mode':
        return Promise.resolve(Response.json(state.mode === null ? { isConfigured: false } : { mode: state.mode }));
      case 'compatibility':
        return Promise.resolve(Response.json({ compatibility: state.compatibility }));
      case 'contexts':
        return Promise.resolve(Response.json(state.contexts));
      case 'details':
        return Promise.resolve(Response.json(state.details));
      default:
        return Promise.reject(new Error(`Unexpected schema registry fixture: ${path}`));
    }
  };
  const fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(
      new URL(typeof input === 'string' || input instanceof URL ? input : input.url, window.location.href),
      init
    );
    const path = new URL(request.url).pathname.split('/schema-registry/')[1];
    if (path === undefined) {
      return Promise.reject(new Error(`Unexpected fixture request: ${request.url}`));
    }
    if (request.method !== 'GET') {
      return request.text().then((body) => write(path, request.method, body === '' ? undefined : body));
    }
    return read(path);
  };
  return { state, pending, write, fetch };
}
