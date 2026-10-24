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

import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, createClient, createRouterTransport } from '@connectrpc/connect';
import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { config, isEmbedded } from 'config';
import { ListPipelinesResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { listPipelines } from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import { SecretService } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { toast } from 'sonner';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

rs.mock('config', () => ({
  ...rs.requireActual<typeof import('config')>('config'),
  isEmbedded: rs.fn(),
}));

import KafkaConnectOverview from './overview';
import { useApiStore } from '../../../state/backend-api';
import type { KafkaConnectors } from '../../../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../../../state/supported-features';

const NEW_LIST_CTA = 'Create a pipeline';

const transport = createRouterTransport(({ rpc }) => {
  rpc(listPipelines, () => create(ListPipelinesResponseSchema, { response: {} }));
});

const renderPage = (embedded: boolean) => {
  rs.mocked(isEmbedded).mockReturnValue(embedded);
  renderWithFileRoutes(<KafkaConnectOverview matchedPath="/connect-clusters" />, { transport });
};

describe('connect overview mount', () => {
  const initialState = useApiStore.getState();
  const initialFeatures = useSupportedFeaturesStore.getState();
  const initialSecretsClient = config.rpcnSecretsClient;
  beforeEach(() => {
    const originalFetch = config.fetch;
    rs.spyOn(config, 'fetch').mockImplementation((input, init) => {
      if (input === `${config.restBasePath}/kafka-connect/connectors` && init?.method === 'GET') {
        return Promise.resolve(Response.json({ isConfigured: false, clusters: null } satisfies KafkaConnectors));
      }
      return originalFetch(input, init);
    });
  });
  afterEach(() => {
    rs.restoreAllMocks();
    useApiStore.setState(initialState, true);
    useSupportedFeaturesStore.setState(initialFeatures, true);
    config.rpcnSecretsClient = initialSecretsClient;
  });

  it('renders the new pipelines list in Cloud', async () => {
    renderPage(true);

    await waitFor(() => expect(screen.getByRole('button', { name: NEW_LIST_CTA })).toBeInTheDocument());
  });

  it('keeps the legacy path when not embedded', async () => {
    useSupportedFeaturesStore.setState({ pipelinesApi: false });
    renderPage(false);
    await waitFor(() => expect(screen.getByText('Using Redpanda Connect')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: NEW_LIST_CTA })).not.toBeInTheDocument();
  });

  it('loads connectors without probing unused secret scope permissions', async () => {
    const toastError = rs.spyOn(toast, 'error');
    config.rpcnSecretsClient = createClient(
      SecretService,
      createRouterTransport(({ rpc }) => {
        rpc(SecretService.method.listSecretScopes, () => {
          throw new ConnectError('scope lookup denied', Code.PermissionDenied);
        });
      })
    );
    useSupportedFeaturesStore.setState({ pipelinesApi: true });

    renderPage(true);

    await waitFor(() =>
      expect(useApiStore.getState().connectConnectors).toEqual({ isConfigured: false, clusters: null })
    );
    expect(toastError).not.toHaveBeenCalled();
  });
});
