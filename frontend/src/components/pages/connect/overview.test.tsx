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
import { createRouterTransport } from '@connectrpc/connect';
import { describe, expect, it, rs } from '@rstest/core';
import { isEmbedded } from 'config';
import { ListPipelinesResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { listPipelines } from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

rs.mock('config', () => ({
  ...rs.requireActual<typeof import('config')>('config'),
  isEmbedded: rs.fn(),
}));

import KafkaConnectOverview from './overview';
import { useSupportedFeaturesStore } from '../../../state/supported-features';

const NEW_LIST_CTA = 'Create a pipeline';

const transport = createRouterTransport(({ rpc }) => {
  rpc(listPipelines, () => create(ListPipelinesResponseSchema, { response: {} }));
});

const renderPage = (embedded: boolean) => {
  rs.mocked(isEmbedded).mockReturnValue(embedded);
  renderWithFileRoutes(<KafkaConnectOverview matchedPath="/connect-clusters" />, { transport });
};

describe('Connect overview mount', () => {
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
});
