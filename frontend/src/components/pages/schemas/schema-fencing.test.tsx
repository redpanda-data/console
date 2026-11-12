import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ClusterFenceState,
  GetClusterFenceBrokerStatusResponseSchema,
  GetClusterFenceStatusResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';
import {
  getClusterFenceBrokerStatus,
  getClusterFenceStatus,
} from 'protogen/redpanda/api/dataplane/v1/cluster_fence-ClusterFenceService_connectquery';
import { api } from 'state/backend-api';
import { useSupportedFeaturesStore } from 'state/supported-features';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

import { createSchemaRegistryFixture, createSchemaRegistryUser } from './__fixtures__/schema-registry';
import { EditSchemaModePage } from './edit-mode';

const initialFeatures = useSupportedFeaturesStore.getState();
const initialUser = api.userData;
let fixture = createSchemaRegistryFixture();

beforeEach(() => {
  fixture = createSchemaRegistryFixture();
  api.userData = createSchemaRegistryUser();
  useSupportedFeaturesStore.setState({ clusterFence: true });
  rs.spyOn(globalThis, 'fetch').mockImplementation(fixture.fetch);
});

afterEach(() => {
  cleanup();
  useSupportedFeaturesStore.setState(initialFeatures, true);
  api.userData = initialUser;
  rs.restoreAllMocks();
});

function renderMode(state: ClusterFenceState | 'offline') {
  const transport = createRouterTransport(({ rpc }) => {
    rpc(getClusterFenceStatus, () => {
      if (state === 'offline') {
        throw new ConnectError('No controller leader', Code.Unavailable);
      }
      return create(GetClusterFenceStatusResponseSchema, { fence: { state, revision: 1n } });
    });
    rpc(getClusterFenceBrokerStatus, () =>
      create(GetClusterFenceBrokerStatusResponseSchema, {
        broker: { nodeId: 1, fence: { state: ClusterFenceState.FENCED, revision: 1n } },
      })
    );
  });
  renderWithFileRoutes(<EditSchemaModePage />, { transport });
}

describe('schema writes honor the actual cluster fence', () => {
  test.each([ClusterFenceState.FENCING, ClusterFenceState.FENCED, 'offline'])(
    'rejects saving while the cluster blocks (%s)',
    async (state) => {
      const user = userEvent.setup();
      renderMode(state);
      const save = await screen.findByTestId('edit-mode-save-btn');
      await waitFor(() => expect(save).toBeDisabled());
      await user.click(save);
      expect(fixture.write).not.toHaveBeenCalled();
    }
  );

  test('an unreadable fence state does not invent a write restriction', async () => {
    const user = userEvent.setup();
    renderMode(ClusterFenceState.UNSPECIFIED);
    await user.click(await screen.findByTestId('edit-mode-save-btn'));
    await waitFor(() =>
      expect(fixture.write).toHaveBeenCalledWith('mode', 'PUT', JSON.stringify({ mode: 'READWRITE' }))
    );
  });

  test('missing authorization still disables saving when the fence is open', async () => {
    api.userData = createSchemaRegistryUser(false);
    renderMode(ClusterFenceState.UNFENCED);
    expect(await screen.findByTestId('edit-mode-save-btn')).toBeDisabled();
    expect(fixture.write).not.toHaveBeenCalled();
  });
});
