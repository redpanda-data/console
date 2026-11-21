import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ClusterFenceState,
  GetClusterFenceStatusResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/cluster_fence_pb';
import { getClusterFenceStatus } from 'protogen/redpanda/api/dataplane/v1/cluster_fence-ClusterFenceService_connectquery';
import {
  type CreateRoleRequest,
  CreateRoleResponseSchema,
  ListRolesResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { createRole, listRoles } from 'protogen/redpanda/api/dataplane/v1/security-SecurityService_connectquery';
import { useSupportedFeaturesStore } from 'state/supported-features';

import { RoleCreateDialog } from './role-create-dialog';
import { SecurityQueryProvider } from '../__fixtures__/query-provider';

const navigate = rs.fn<() => Promise<void>>(() => Promise.resolve());
rs.mock('@tanstack/react-router', () => {
  const actual = rs.requireActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');
  return { ...actual, useNavigate: () => navigate };
});

const initialFeatures = useSupportedFeaturesStore.getState();
beforeEach(() => {
  useSupportedFeaturesStore.setState({ clusterFence: true });
  navigate.mockClear();
});
afterEach(() => {
  cleanup();
  useSupportedFeaturesStore.setState(initialFeatures, true);
});

function renderCreate(state: ClusterFenceState) {
  const creates: CreateRoleRequest[] = [];
  const closed = rs.fn<(open: boolean) => void>();
  const transport = createRouterTransport(({ rpc }) => {
    rpc(getClusterFenceStatus, () => create(GetClusterFenceStatusResponseSchema, { fence: { state, revision: 1n } }));
    rpc(listRoles, () => create(ListRolesResponseSchema));
    rpc(createRole, (request) => {
      creates.push(request);
      return create(CreateRoleResponseSchema, { role: request.role });
    });
  });
  render(
    <SecurityQueryProvider transport={transport}>
      <RoleCreateDialog onOpenChange={closed} open />
    </SecurityQueryProvider>
  );
  return { creates, closed };
}

describe('role creation honors the actual cluster fence', () => {
  test.each([ClusterFenceState.FENCING, ClusterFenceState.FENCED])(
    'enter cannot bypass the fence (%s)',
    async (state) => {
      const user = userEvent.setup();
      const { creates } = renderCreate(state);
      await screen.findByText(
        'You can’t create, change or delete roles while this cluster is fenced. Unfence it first.'
      );
      await user.type(screen.getByLabelText('Role name'), 'analytics-writer{Enter}');
      expect(screen.getByRole('button', { name: 'Create', exact: true })).toBeDisabled();
      expect(creates).toEqual([]);
    }
  );

  test('an open fence still permits the normal typed role-create request', async () => {
    const user = userEvent.setup();
    const { creates, closed } = renderCreate(ClusterFenceState.UNFENCED);
    await user.type(screen.getByLabelText('Role name'), 'analytics-writer{Enter}');
    await waitFor(() => expect(closed).toHaveBeenCalledWith(false));
    expect(creates).toMatchObject([{ role: { name: 'analytics-writer' } }]);
    expect(creates).toHaveLength(1);
  });
});
