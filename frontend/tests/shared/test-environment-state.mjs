import { rm } from 'node:fs/promises';

const CONTAINER_SLOTS = ['sourceBackend', 'backend', 'connect', 'owlshop', 'destRedpanda', 'kafka', 'redpanda'];

const CONTAINER_SLOT_SET = new Set(CONTAINER_SLOTS);

function collectRejected(results, errors) {
  for (const result of results) {
    if (result.status === 'rejected') {
      errors.push(result.reason);
    }
  }
}

async function collectFailure(operation, errors) {
  try {
    await operation();
  } catch (error) {
    errors.push(error);
  }
}

function throwIfAnyFailed(errors, message) {
  if (errors.length > 0) {
    throw new AggregateError(errors, message);
  }
}

function uniqueSlotValues(state, suffix) {
  return [...new Set(CONTAINER_SLOTS.map((slot) => state[`${slot}${suffix}`]).filter(Boolean))];
}

function stopContainer(container) {
  return container.stop({
    timeout: 10_000,
    remove: true,
    removeVolumes: true,
  });
}

function removeTempPath(path) {
  return rm(path, { force: true, recursive: true });
}

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

export function rememberContainer(state, slot, container) {
  if (!CONTAINER_SLOT_SET.has(slot)) {
    throw new Error(`Unknown test container slot: ${slot}`);
  }
  state[`${slot}Id`] = container.getId();
  state[`${slot}Container`] = container;
  return container;
}

export function serializeEnvironmentState(state) {
  const serialized = {};
  for (const [key, value] of Object.entries(state)) {
    if (key === 'network' || key.endsWith('Container')) {
      continue;
    }
    serialized[key] = value;
  }
  return serialized;
}

export async function cleanupStartedResources(state) {
  const errors = [];
  const containers = uniqueSlotValues(state, 'Container');

  const stopResults = await Promise.allSettled(containers.map((container) => stopContainer(container)));
  collectRejected(stopResults, errors);

  if (state.network) {
    await collectFailure(() => state.network.stop(), errors);
  }

  const tempResults = await Promise.allSettled((state.tempPaths ?? []).map((path) => removeTempPath(path)));
  collectRejected(tempResults, errors);

  throwIfAnyFailed(errors, 'Failed to clean up Playwright test environment');
}

export async function cleanupSerializedResources(
  state,
  { removeContainer, removeNetwork, removePath = removeTempPath }
) {
  const errors = [];
  const containerIds = uniqueSlotValues(state, 'Id');

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
