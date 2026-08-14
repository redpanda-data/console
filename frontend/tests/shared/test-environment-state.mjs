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
  const containers = [...new Set(CONTAINER_SLOTS.map((slot) => state[`${slot}Container`]).filter(Boolean))];

  const stopResults = await Promise.allSettled(
    containers.map((container) =>
      container.stop({
        timeout: 10_000,
        remove: true,
        removeVolumes: true,
      })
    )
  );
  collectRejected(stopResults, errors);

  if (state.network) {
    try {
      await state.network.stop();
    } catch (error) {
      errors.push(error);
    }
  }

  const tempResults = await Promise.allSettled(
    (state.tempPaths ?? []).map((path) => rm(path, { force: true, recursive: true }))
  );
  collectRejected(tempResults, errors);

  if (errors.length > 0) {
    throw new AggregateError(errors, 'Failed to clean up Playwright test environment');
  }
}

export async function cleanupSerializedResources(
  state,
  { removeContainer, removeNetwork, removePath = (path) => rm(path, { force: true, recursive: true }) }
) {
  const errors = [];
  const containerIds = [...new Set(CONTAINER_SLOTS.map((slot) => state[`${slot}Id`]).filter(Boolean))];

  const [containerResults, tempResults] = await Promise.all([
    Promise.allSettled(containerIds.map((id) => removeContainer(id))),
    Promise.allSettled((state.tempPaths ?? []).map((path) => removePath(path))),
  ]);
  collectRejected(containerResults, errors);
  collectRejected(tempResults, errors);

  if (state.networkId) {
    try {
      await removeNetwork(state.networkId);
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, 'Failed to clean up serialized Playwright test environment');
  }
}
