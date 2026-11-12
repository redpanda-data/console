import { z } from 'zod';

import { rm } from 'node:fs/promises';

/** @typedef {'sourceBackend' | 'backend' | 'connect' | 'owlshop' | 'destRedpanda' | 'kafka' | 'redpanda'} ContainerSlot */
/** @typedef {{ getId: () => string, stop: (options: { timeout: number, remove: boolean, removeVolumes: boolean }) => Promise<unknown> }} ContainerHandle */
/** @typedef {Record<`${ContainerSlot}Id`, string> & Partial<Record<`${ContainerSlot}Container`, ContainerHandle>> & {
 * networkId: string,
 * network?: { stop: () => Promise<unknown> },
 * tempPaths: string[],
 * isEnterprise?: boolean,
 * needsShadowlink?: boolean,
 * }} EnvironmentState */
/** @typedef {Pick<EnvironmentState, `${ContainerSlot}Id` | 'networkId' | 'tempPaths' | 'isEnterprise' | 'needsShadowlink'>} SerializedEnvironmentState */

/** @type {readonly ContainerSlot[]} */
const CONTAINER_SLOTS = ['sourceBackend', 'backend', 'connect', 'owlshop', 'destRedpanda', 'kafka', 'redpanda'];

const CONTAINER_SLOT_SET = new Set(CONTAINER_SLOTS);

const serializedStateSchema = z.looseObject({
  sourceBackendId: z.string().default(''),
  backendId: z.string().default(''),
  connectId: z.string().default(''),
  owlshopId: z.string().default(''),
  destRedpandaId: z.string().default(''),
  kafkaId: z.string().default(''),
  redpandaId: z.string().default(''),
  networkId: z.string().default(''),
  tempPaths: z.array(z.string()).default([]),
  isEnterprise: z.boolean().optional(),
  needsShadowlink: z.boolean().optional(),
});

/** @param {unknown} value */
export function parseSerializedEnvironmentState(value) {
  return serializedStateSchema.parse(value);
}

/** @param {PromiseSettledResult<unknown>[]} results
 * @param {unknown[]} errors */
function collectRejected(results, errors) {
  for (const result of results) {
    if (result.status === 'rejected') {
      errors.push(result.reason);
    }
  }
}

/** @param {() => Promise<unknown>} operation
 * @param {unknown[]} errors */
async function collectFailure(operation, errors) {
  try {
    await operation();
  } catch (error) {
    errors.push(error);
  }
}

/** @param {unknown[]} errors
 * @param {string} message */
function throwIfAnyFailed(errors, message) {
  if (errors.length > 0) {
    throw new AggregateError(errors, message);
  }
}

/** @param {EnvironmentState} state */
function startedContainers(state) {
  const containers = CONTAINER_SLOTS.flatMap((slot) => {
    const container = state[`${slot}Container`];
    return container ? [container] : [];
  });
  return [...new Set(containers)];
}

/** @param {SerializedEnvironmentState} state */
function serializedContainerIds(state) {
  return [
    ...new Set(
      CONTAINER_SLOTS.flatMap((slot) => {
        const containerId = state[`${slot}Id`];
        return typeof containerId === 'string' && containerId !== '' ? [containerId] : [];
      })
    ),
  ];
}

/** @param {ContainerHandle} container */
function stopContainer(container) {
  return container.stop({
    timeout: 10_000,
    remove: true,
    removeVolumes: true,
  });
}

/** @param {string} path */
function removeTempPath(path) {
  return rm(path, { force: true, recursive: true });
}

/** @param {Partial<EnvironmentState>} initial
 * @returns {EnvironmentState} */
export function createEnvironmentState(initial = {}) {
  return {
    networkId: '',
    redpandaId: '',
    kafkaId: '',
    owlshopId: '',
    connectId: '',
    backendId: '',
    destRedpandaId: '',
    sourceBackendId: '',
    tempPaths: [],
    ...initial,
  };
}

/** @param {EnvironmentState} state
 * @param {ContainerSlot} slot
 * @param {ContainerHandle} container */
export function rememberContainer(state, slot, container) {
  if (!CONTAINER_SLOT_SET.has(slot)) {
    throw new Error(`Unknown test container slot: ${slot}`);
  }
  state[`${slot}Id`] = container.getId();
  state[`${slot}Container`] = container;
  return container;
}

/** @param {EnvironmentState} state
 * @returns {SerializedEnvironmentState} */
export function serializeEnvironmentState(state) {
  const serialized = { ...state };
  for (const key of Object.keys(serialized)) {
    if (key === 'network' || key.endsWith('Container')) {
      Reflect.deleteProperty(serialized, key);
    }
  }
  return serialized;
}

/** @param {EnvironmentState} state */
export async function cleanupStartedResources(state) {
  /** @type {unknown[]} */
  const errors = [];
  const containers = startedContainers(state);

  const stopResults = await Promise.allSettled(containers.map((container) => stopContainer(container)));
  collectRejected(stopResults, errors);

  const network = state.network;
  if (network) {
    await collectFailure(() => network.stop(), errors);
  }

  const tempResults = await Promise.allSettled((state.tempPaths ?? []).map((path) => removeTempPath(path)));
  collectRejected(tempResults, errors);

  throwIfAnyFailed(errors, 'Failed to clean up Playwright test environment');
}

/** @param {SerializedEnvironmentState} state
 * @param {{ removeContainer: (id: string) => Promise<unknown>, removeNetwork: (id: string) => Promise<unknown>, removePath?: (path: string) => Promise<unknown> }} operations */
export async function cleanupSerializedResources(
  state,
  { removeContainer, removeNetwork, removePath = removeTempPath }
) {
  /** @type {unknown[]} */
  const errors = [];
  const containerIds = serializedContainerIds(state);

  const [containerResults, tempResults] = await Promise.all([
    Promise.allSettled(containerIds.map((id) => removeContainer(id))),
    Promise.allSettled((state.tempPaths ?? []).map((path) => removePath(path))),
  ]);
  collectRejected(containerResults, errors);
  collectRejected(tempResults, errors);

  if (state.networkId) {
    await collectFailure(() => removeNetwork(state.networkId), errors);
  }

  throwIfAnyFailed(errors, 'Failed to clean up serialized Playwright test environment');
}
