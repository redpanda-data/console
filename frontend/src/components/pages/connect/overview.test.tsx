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
import { afterAll, afterEach, beforeAll, describe, expect, it } from '@rstest/core';
import { config, createAuthInjectingFetch } from 'config';
import { HttpResponse, http } from 'msw';
import { HttpNetworkFrame } from 'msw/experimental';
import { setupServer } from 'msw/node';
import { ListPipelinesResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { listPipelines } from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import { SecretService } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

import KafkaConnectOverview from './overview';
import { useApiStore } from '../../../state/backend-api';
import type { KafkaConnectors } from '../../../state/rest-interfaces';
import { useSupportedFeaturesStore } from '../../../state/supported-features';

const connectorsUrl = new URL(`${config.restBasePath}/kafka-connect/connectors`, window.location.href).href;
const guardedFetch = globalThis.fetch;
const originalFetch = config.fetch;
const server = setupServer(
  http.get(connectorsUrl, () => HttpResponse.json({ isConfigured: false, clusters: null } satisfies KafkaConnectors))
);

beforeAll(() => {
  server.listen({
    async onUnhandledFrame({ frame }) {
      if (frame instanceof HttpNetworkFrame) {
        await guardedFetch(frame.data.request);
      }
      throw new Error('Unexpected network frame in the Connect overview tests');
    },
  });
  config.fetch = createAuthInjectingFetch(globalThis.fetch);
});

afterAll(() => {
  config.fetch = originalFetch;
  server.close();
});

const NEW_LIST_CTA = 'Create a pipeline';

const transport = createRouterTransport(({ rpc }) => {
  rpc(listPipelines, () => create(ListPipelinesResponseSchema, { response: {} }));
});

const renderPage = (embedded: boolean) => {
  config.jwt = embedded ? 'embedded-test-token' : undefined;
  renderWithFileRoutes(<KafkaConnectOverview matchedPath="/connect-clusters" />, { transport });
};

describe('connect overview mount', () => {
  const initialState = useApiStore.getState();
  const initialFeatures = useSupportedFeaturesStore.getState();
  const initialConfig = { rpcnSecretsClient: config.rpcnSecretsClient, jwt: config.jwt };
  afterEach(() => {
    useApiStore.setState(initialState, true);
    useSupportedFeaturesStore.setState(initialFeatures, true);
    Object.assign(config, initialConfig);
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
    const scopeReads: string[] = [];
    config.rpcnSecretsClient = createClient(
      SecretService,
      createRouterTransport(({ rpc }) => {
        rpc(SecretService.method.listSecretScopes, () => {
          scopeReads.push('ListSecretScopes');
          throw new ConnectError('scope lookup denied', Code.PermissionDenied);
        });
      })
    );
    useSupportedFeaturesStore.setState({ pipelinesApi: true });

    renderPage(true);

    await waitFor(() =>
      expect(useApiStore.getState().connectConnectors).toEqual({ isConfigured: false, clusters: null })
    );
    expect(screen.getByRole('button', { name: NEW_LIST_CTA })).toBeVisible();
    expect(scopeReads).toEqual([]);
  });
});
