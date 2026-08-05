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

import { act, renderWithFileRoutes, screen, waitFor } from 'test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import KafkaConnectOverview from './overview';
import { type EndpointCompatibility, Feature, useSupportedFeaturesStore } from '../../../state/supported-features';

// The Connect page swaps wholesale between the new pipelines list and the legacy tabs, keyed on
// whether the backend serves the managed pipelines API. Self-hosted reports it unsupported, and its
// install intro lives behind the legacy path — so a mount regression here silently hides one or the
// other. Asserted through the real store rather than a mock, since the branch reads it reactively.
const setPipelineServiceSupport = (isSupported: boolean) => {
  const compatibility: EndpointCompatibility = {
    kafkaVersion: '3.6.0',
    endpoints: [
      {
        endpoint: Feature.PipelineService.endpoint,
        method: Feature.PipelineService.method,
        isSupported,
      },
    ],
  };
  act(() => {
    useSupportedFeaturesStore.getState().setEndpointCompatibility(compatibility);
  });
};

// The status tabs belong to the new list and nothing else on this page renders them.
const RUNNING_TAB_RE = /^Running/;
const newListMarker = () => screen.queryByRole('tab', { name: RUNNING_TAB_RE });

afterEach(() => {
  act(() => {
    useSupportedFeaturesStore.getState().setEndpointCompatibility(null as unknown as EndpointCompatibility);
  });
});

describe('Connect overview mount', () => {
  it('renders the new pipelines list wherever the pipelines API is served', async () => {
    renderWithFileRoutes(<KafkaConnectOverview matchedPath="/connect-clusters" />);
    setPipelineServiceSupport(true);

    await waitFor(() => {
      expect(newListMarker()).toBeInTheDocument();
    });
  });

  it('keeps the legacy path when the backend does not serve it', async () => {
    renderWithFileRoutes(<KafkaConnectOverview matchedPath="/connect-clusters" />);
    setPipelineServiceSupport(false);

    // Self-hosted lands on the legacy path's install intro, not an errored pipelines table.
    await waitFor(() => {
      expect(screen.getByText('Using Redpanda Connect')).toBeInTheDocument();
    });
    expect(newListMarker()).not.toBeInTheDocument();
  });
});
