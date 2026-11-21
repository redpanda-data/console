/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

/*eslint block-scoped-var: "error"*/

import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import type { TransformMetadata } from 'protogen/redpanda/api/dataplane/v1/transform_pb';
import { createStore as zustandCreate } from 'zustand/vanilla';

import { collectPages } from './legacy-pagination';
import type { ListTransformsResponse } from '../protogen/redpanda/api/console/v1alpha1/transform_pb';
import {
  GetPipelinesBySecretsRequestSchema as GetPipelinesBySecretsRequestSchemaDataPlane,
  type Pipeline,
  type PipelineCreate,
  type PipelineUpdate,
} from '../protogen/redpanda/api/dataplane/v1/pipeline_pb';
import {
  type CreateSecretRequest,
  type DeleteSecretRequest,
  type ListSecretScopesRequest,
  ListSecretsRequestSchema as ListSecretsRequestSchemaDataPlane,
  Scope,
  type Secret,
  type UpdateSecretRequest,
} from '../protogen/redpanda/api/dataplane/v1/secret_pb';
import { config as appConfig } from '../runtime-config';
import { Features } from '../state/supported-features';
import { arrayFilterNull } from '../utils/array-utils';
import { isNonEmptyString } from '../utils/string-utils';
export type RolePrincipal = {
  name: string;
  principalType: 'User' | 'Group';
};
type SecurityClient = NonNullable<typeof appConfig.securityClient>;

// One page of roles; a failed request is reported and ends the listing like an empty page.
async function fetchRolesPage(client: SecurityClient, pageToken: string, onError: (error: ConnectError) => void) {
  const res = await client.listRoles({ request: { pageSize: 500, pageToken } }).catch((error: unknown) => {
    onError(ConnectError.from(error));
    return null;
  });
  return res?.response;
}

function listAllRoleNames(client: SecurityClient, onError: (error: ConnectError) => void): Promise<string[]> {
  const roles: string[] = [];
  const nextPage = async (pageToken: string): Promise<string[]> => {
    const page = await fetchRolesPage(client, pageToken, onError);
    roles.push(...(page?.roles.map((x) => x.name) ?? []));
    return isNonEmptyString(page?.nextPageToken) ? nextPage(page.nextPageToken) : roles;
  };
  return nextPage('');
}

// "User:alice" → { principalType: 'User', name: 'alice' }; anything else is logged and skipped.
function parseRolePrincipal(roleName: string, principal: string): RolePrincipal | null {
  const colonIdx = principal.indexOf(':');
  if (colonIdx < 0) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error('failed to split principal of role', { roleName, principal });
    return null;
  }
  const principalTypeRaw = principal.slice(0, colonIdx);
  if (principalTypeRaw !== 'User' && principalTypeRaw !== 'Group') {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.warn('unsupported principal type in refreshRoleMembers, skipping', { roleName, principal });
    return null;
  }
  return { principalType: principalTypeRaw, name: principal.slice(colonIdx + 1) };
}
type GetRoleResult = {
  response?: {
    role?: {
      name: string;
    };
    members: Array<{
      principal: string;
    }>;
  };
};
// The role's name and members, or null when the reply carries no role.
function roleMembersEntry(res: GetRoleResult): [string, RolePrincipal[]] | null {
  const { response } = res;
  const role = response?.role;
  if (!(response && role)) {
    return null; // how could this ever happen, maybe someone deleted the role right before we retreived the members?
  }
  const members = arrayFilterNull(response.members.map((x) => parseRolePrincipal(role.name, x.principal)));
  return [role.name, members];
}

async function collectRoleMembers(rolePromises: Promise<GetRoleResult>[]): Promise<Map<string, RolePrincipal[]>> {
  const roleMembers = new Map<string, RolePrincipal[]>();
  const roles = await Promise.all(rolePromises);
  for (const role of roles) {
    const entry = roleMembersEntry(role);
    if (entry) {
      roleMembers.set(entry[0], entry[1]);
    }
  }
  return roleMembers;
}

type RolesState = ReturnType<typeof _rolesCreator>;
type SetRolesState = (partial: Partial<RolesState>) => void;
type GetRolesState = () => RolesState;

const _rolesCreator = (set: SetRolesState, get: GetRolesState) => ({
  roles: [] as string[],
  roleMembers: new Map<string, RolePrincipal[]>(), // RoleName -> Principals
  rolesError: null as ConnectError | null,

  async refreshRoles(): Promise<void> {
    set({ rolesError: null });
    const client = appConfig.securityClient;
    if (!client) {
      throw new Error('security client is not initialized');
    }

    const roles = Features.rolesApi ? await listAllRoleNames(client, (error) => set({ rolesError: error })) : [];

    set({ roles });
  },

  async refreshRoleMembers() {
    const client = appConfig.securityClient;
    if (!client) {
      throw new Error('security client is not initialized');
    }

    const rolePromises: Promise<GetRoleResult>[] = Features.rolesApi
      ? get().roles.map((role: string) => client.getRole({ request: { roleName: role } }))
      : [];

    await Promise.allSettled(rolePromises);

    const roleMembers = await collectRoleMembers(rolePromises);
    set({ roleMembers });
  },

  async createRole(name: string) {
    const client = appConfig.securityClient;
    if (!client) {
      throw new Error('security client is not initialized');
    }

    if (Features.rolesApi) {
      await client.createRole({ request: { role: { name } } });
    }
  },

  async deleteRole(name: string, deleteAcls: boolean) {
    const client = appConfig.securityClient;
    if (!client) {
      throw new Error('security client is not initialized');
    }

    if (Features.rolesApi) {
      await client.deleteRole({ request: { roleName: name, deleteAcls } });
    }
  },

  async updateRoleMembership(roleName: string, add: RolePrincipal[], remove: RolePrincipal[], createRole = false) {
    const client = appConfig.securityClient;
    if (!client) {
      throw new Error('security client is not initialized');
    }

    return await client.updateRoleMembership({
      request: {
        roleName,
        add: add.map((p) => ({ principal: `${p.principalType}:${p.name}` })),
        remove: remove.map((p) => ({ principal: `${p.principalType}:${p.name}` })),
        create: createRole,
      },
    });
  },
});
export const useRolesStore = zustandCreate(_rolesCreator);

export const rolesApi = new Proxy<RolesState>(useRolesStore.getState(), {
  get(_, prop: string | symbol): unknown {
    return Reflect.get(useRolesStore.getState(), prop);
  },
  set(_, prop: string | symbol, value: unknown) {
    useRolesStore.setState({ [prop]: value });
    return true;
  },
});

type PipelinesState = ReturnType<typeof _pipelinesCreator>;
type SetPipelinesState = (partial: Partial<PipelinesState>) => void;

const _pipelinesCreator = (set: SetPipelinesState) => ({
  pipelines: undefined as undefined | Pipeline[],
  pipelinesError: null as ConnectError | null,

  async refreshPipelines(_force: boolean): Promise<void> {
    const client = appConfig.pipelinesClient;
    if (!client) {
      throw new Error('pipelines client is not initialized');
    }

    set({ pipelinesError: null });
    const pipelines = await collectPages(async (pageToken) => {
      const res = await client.listPipelines({ request: { pageSize: 500, pageToken } }).catch((error: unknown) => {
        set({ pipelinesError: ConnectError.from(error) });
      });
      const response = res?.response;
      return response ? { items: response.pipelines, nextPageToken: response.nextPageToken } : undefined;
    });

    set({ pipelines });
  },

  async deletePipeline(id: string) {
    const client = appConfig.pipelinesClient;
    if (!client) {
      throw new Error('pipelines client is not initialized');
    }

    await client.deletePipeline({ request: { id } });
  },
  async createPipeline(pipeline: PipelineCreate) {
    const client = appConfig.pipelinesClient;
    if (!client) {
      throw new Error('pipelines client is not initialized');
    }

    return await client.createPipeline({ request: { pipeline } });
  },
  async updatePipeline(id: string, pipelineUpdate: PipelineUpdate) {
    const client = appConfig.pipelinesClient;
    if (!client) {
      throw new Error('pipelines client is not initialized');
    }

    return await client.updatePipeline({
      request: {
        id,
        pipeline: pipelineUpdate,
      },
    });
  },
  async startPipeline(id: string) {
    const client = appConfig.pipelinesClient;
    if (!client) {
      throw new Error('pipelines client is not initialized');
    }

    await client.startPipeline({ request: { id } });
  },
  async stopPipeline(id: string) {
    const client = appConfig.pipelinesClient;
    if (!client) {
      throw new Error('pipelines client is not initialized');
    }

    await client.stopPipeline({ request: { id } });
  },
});
export const usePipelinesStore = zustandCreate<PipelinesState>()(_pipelinesCreator);

export const pipelinesApi = new Proxy<PipelinesState>(usePipelinesStore.getState(), {
  get(_, prop: string | symbol): unknown {
    return Reflect.get(usePipelinesStore.getState(), prop);
  },
  set(_, prop: string | symbol, value: unknown) {
    usePipelinesStore.setState({ [prop]: value });
    return true;
  },
});

type RpcnSecretManagerState = ReturnType<typeof _rpcnSecretManagerCreator>;
type SetRpcnSecretManagerState = (partial: Partial<RpcnSecretManagerState>) => void;
type GetRpcnSecretManagerState = () => RpcnSecretManagerState;

const _rpcnSecretManagerCreator = (set: SetRpcnSecretManagerState, get: GetRpcnSecretManagerState) => ({
  secrets: undefined as undefined | Secret[],
  secretsByPipeline: undefined as
    | {
        secretId: string;
        pipelines: Pipeline[];
      }[]
    | undefined,
  isEnable: true,

  async refreshSecrets(_force: boolean): Promise<void> {
    const client = appConfig.rpcnSecretsClient;
    if (!client) {
      throw new Error('redpanda connect secret client is not initialized');
    }

    // handle error in order to avoid crash app for this request
    const secretsByPipeline = await get()
      .getPipelinesBySecret()
      .catch(() => []);
    set({ secretsByPipeline });

    const secrets = await collectPages(async (pageToken) => {
      const res = await client.listSecrets({
        request: create(ListSecretsRequestSchemaDataPlane, { pageToken, pageSize: 100 }),
      });
      const response = res.response;
      return response ? { items: response.secrets, nextPageToken: response.nextPageToken } : undefined;
    });

    set({ secrets });
  },

  async delete(secret: DeleteSecretRequest) {
    const client = appConfig.rpcnSecretsClient;
    if (!client) {
      throw new Error('redpanda connect secret client is not initialized');
    }

    await client.deleteSecret({ request: secret });
  },
  async create(secret: CreateSecretRequest) {
    const client = appConfig.rpcnSecretsClient;
    if (!client) {
      throw new Error('redpanda connect secret client is not initialized');
    }

    await client.createSecret({ request: secret });
  },
  async update(_id: string, updateSecretRequest: UpdateSecretRequest) {
    const client = appConfig.rpcnSecretsClient;
    if (!client) {
      throw new Error('redpanda connect secret client is not initialized');
    }

    await client.updateSecret({ request: updateSecretRequest });
  },
  async checkScope(listSecretScopesRequest: ListSecretScopesRequest) {
    const client = appConfig.rpcnSecretsClient;
    if (!client) {
      throw new Error('redpanda connect secret client is not initialized');
    }

    const res = await client.listSecretScopes({
      request: listSecretScopesRequest,
    });

    if (!res.response) {
      set({ isEnable: false });
      return;
    }

    const isEnable = res.response?.scopes.some((scope) => scope === Scope.REDPANDA_CONNECT);
    set({ isEnable });
    return isEnable;
  },
  async getPipelinesBySecret() {
    const client = appConfig.pipelinesClient;
    if (!client) {
      throw new Error('redpanda connect dataplane pipeline is not initialized');
    }

    const pipelinesBySecrets = await client.getPipelinesBySecrets({
      request: create(GetPipelinesBySecretsRequestSchemaDataPlane),
    });
    return pipelinesBySecrets.response?.pipelinesForSecret.map(({ secretId, pipelines }) => ({
      secretId,
      pipelines,
    }));
  },
});
export const useRpcnSecretManagerStore = zustandCreate(_rpcnSecretManagerCreator);

export const rpcnSecretManagerApi = new Proxy<RpcnSecretManagerState>(useRpcnSecretManagerStore.getState(), {
  get(_, prop: string | symbol): unknown {
    return Reflect.get(useRpcnSecretManagerStore.getState(), prop);
  },
  set(_, prop: string | symbol, value: unknown) {
    useRpcnSecretManagerStore.setState({ [prop]: value });
    return true;
  },
});

type TransformsClient = NonNullable<typeof appConfig.transformsClient>;

// One page of transforms; a failed request ends the listing like an empty page.
async function fetchTransformsPage(client: TransformsClient, pageToken: string) {
  const res: ListTransformsResponse | null = await client
    .listTransforms({ request: { pageSize: 500, pageToken } })
    .catch(() => null);
  return res?.response;
}

function listAllTransforms(client: TransformsClient): Promise<TransformMetadata[]> {
  const transforms: TransformMetadata[] = [];
  const nextPage = async (pageToken: string): Promise<TransformMetadata[]> => {
    const page = await fetchTransformsPage(client, pageToken);
    transforms.push(...(page?.transforms ?? []));
    return isNonEmptyString(page?.nextPageToken) ? nextPage(page.nextPageToken) : transforms;
  };
  return nextPage('');
}

type TransformsState = ReturnType<typeof _transformsCreator>;
type SetTransformsState = (
  partial: Partial<TransformsState> | ((state: TransformsState) => Partial<TransformsState>)
) => void;

const _transformsCreator = (set: SetTransformsState) => ({
  transforms: undefined as undefined | TransformMetadata[],
  transformDetails: new Map<string, TransformMetadata>(),

  async refreshTransforms(_force: boolean): Promise<void> {
    const client = appConfig.transformsClient;
    if (!client) {
      throw new Error('transforms client is not initialized');
    }
    const transforms = await listAllTransforms(client);

    const transformDetails = new Map(transforms.map((t) => [t.name, t]));
    set({ transforms, transformDetails });
  },

  async refreshTransformDetails(name: string, _force: boolean): Promise<void> {
    const client = appConfig.transformsClient;
    if (!client) {
      throw new Error('transforms client is not initialized');
    }

    const { response: r } = await client.getTransform({ request: { name } });
    if (!r) {
      throw new Error('got empty response from getTransform');
    }

    const transform = r.transform;
    if (!transform) {
      return;
    }

    set((s) => ({ transformDetails: new Map(s.transformDetails).set(transform.name, transform) }));
  },

  async deleteTransform(name: string) {
    const client = appConfig.transformsClient;
    if (!client) {
      throw new Error('transforms client is not initialized');
    }

    await client.deleteTransform({ request: { name } });
  },
});
export const useTransformsStore = zustandCreate<TransformsState>()(_transformsCreator);

export const transformsApi = new Proxy<TransformsState>(useTransformsStore.getState(), {
  get(_, prop: string | symbol): unknown {
    return Reflect.get(useTransformsStore.getState(), prop);
  },
  set(_, prop: string | symbol, value: unknown) {
    useTransformsStore.setState({ [prop]: value });
    return true;
  },
});
