/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { create } from '@bufbuild/protobuf';
import { SecretSchema } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

rs.mock('state/backend-api', () => {
  const actual = rs.requireActual<typeof import('state/backend-api')>('state/backend-api');
  return {
    ...actual,
    rpcnSecretManagerApi: {
      secrets: [] as unknown[],
      secretsByPipeline: [],
      isEnable: true,
      refreshSecrets: rs.fn().mockResolvedValue(undefined),
      delete: rs.fn().mockResolvedValue(undefined),
    },
  };
});

rs.mock('state/app-global', () => ({
  appGlobal: {
    onRefresh: null,
    historyPush: rs.fn(),
  },
}));

rs.mock('state/ui', () => {
  const actual = rs.requireActual<typeof import('state/ui')>('state/ui');
  return {
    ...actual,
    uiSettings: {
      rpcnSecretList: {
        quickSearch: '',
      },
    },
  };
});

import { rpcnSecretManagerApi } from 'state/backend-api';

import RpConnectSecretsList from './secrets-list';

describe('RpConnectSecretsList', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  test('should call refreshSecrets on render', async () => {
    const refreshSecretsMock = rs.mocked(rpcnSecretManagerApi.refreshSecrets);

    renderWithFileRoutes(<RpConnectSecretsList matchedPath="/rp-connect/secrets" />);

    await waitFor(() => {
      expect(refreshSecretsMock).toHaveBeenCalledWith(true);
    });
  });

  test('should display mock secret ID when secrets are present', async () => {
    const mockSecret = create(SecretSchema, {
      id: 'test-secret-123',
    });

    Object.assign(rpcnSecretManagerApi, {
      secrets: [mockSecret],
      secretsByPipeline: [],
    });

    renderWithFileRoutes(<RpConnectSecretsList matchedPath="/rp-connect/secrets" />);

    await waitFor(() => {
      expect(screen.getByTestId('secret-text-test-secret-123')).toBeVisible();
    });

    expect(screen.getByText('test-secret-123')).toBeVisible();
  });

  test('should display empty state when no secrets exist', async () => {
    Object.assign(rpcnSecretManagerApi, {
      secrets: [],
      secretsByPipeline: [],
    });

    renderWithFileRoutes(<RpConnectSecretsList matchedPath="/rp-connect/secrets" />);

    await waitFor(() => {
      expect(screen.getByText('You have no Redpanda Connect secrets.')).toBeVisible();
    });
  });
});
