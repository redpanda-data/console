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
import userEvent from '@testing-library/user-event';
import { ListPipelinesResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { listPipelines } from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import {
  ListPipelinesResponseSchema as DataPlaneListPipelinesResponseSchema,
  Pipeline_State,
  PipelineSchema,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { renderWithFileRoutes, screen, waitFor, within } from 'test-utils';

rs.mock('config', () => {
  const actual = rs.requireActual<typeof import('config')>('config');
  return {
    ...actual,
    config: { jwt: 'test-jwt-token' },
    isEmbedded: rs.fn(() => false),
    isFeatureFlagEnabled: rs.fn(() => false),
  };
});

import { PipelineListPage } from './list';

const yamlFor = ({ inputs, outputs }: { inputs: string[]; outputs: string[] }) => `
input:
  broker:
    inputs:
${inputs.map((i) => `      - ${i}: {}`).join('\n')}
output:
  broker:
    outputs:
${outputs.map((o) => `      - ${o}: {}`).join('\n')}
`;

type Fixture = {
  id: string;
  displayName: string;
  state: Pipeline_State;
  inputs: string[];
  outputs: string[];
  tags?: Record<string, string>;
};

const FIXTURES: Fixture[] = [
  {
    id: 'aaa111',
    displayName: 'orders-enrichment',
    state: Pipeline_State.RUNNING,
    inputs: ['redpanda', 'redpanda'],
    outputs: ['s3'],
    tags: { env: 'prod' },
  },
  {
    id: 'bbb222',
    displayName: 'clickstream-sink',
    state: Pipeline_State.ERROR,
    inputs: ['http_client'],
    outputs: ['redpanda'],
  },
  {
    id: 'ccc333',
    displayName: 'nightly-export',
    state: Pipeline_State.STOPPED,
    inputs: ['generate'],
    outputs: ['gcp_cloud_storage'],
  },
  {
    id: 'ddd444',
    displayName: 'agent-helper',
    state: Pipeline_State.RUNNING,
    inputs: ['generate'],
    outputs: ['s3'],
    // Agents are filtered out of the pipeline list entirely.
    tags: { __redpanda_cloud_pipeline_type: 'agent' },
  },
];

// Two pages, so the test exercises the drain the list renders behind.
const buildTransport = () =>
  createRouterTransport(({ rpc }) => {
    rpc(listPipelines, (req) => {
      const pageToken = req.request?.pageToken ?? '';
      const page = pageToken === '' ? FIXTURES.slice(0, 2) : FIXTURES.slice(2);
      return create(ListPipelinesResponseSchema, {
        response: create(DataPlaneListPipelinesResponseSchema, {
          pipelines: page.map((f) =>
            create(PipelineSchema, {
              id: f.id,
              displayName: f.displayName,
              state: f.state,
              tags: f.tags ?? {},
              configYaml: yamlFor(f),
            })
          ),
          nextPageToken: pageToken === '' ? 'page2' : '',
        }),
      });
    });
  });

const renderList = () => renderWithFileRoutes(<PipelineListPage />, { transport: buildTransport() });

const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(`^${name}`) });

const rowFor = (displayName: string) => {
  const row = screen.getByText(displayName).closest('tr');
  if (!row) {
    throw new Error(`no row for ${displayName}`);
  }
  return row;
};

const SEARCH_INPUT_RE = /search pipelines/i;
const CLEAR_FILTERS_RE = /clear filters/i;

// Every row links to its pipeline, so the link text is the visible rows.
const visibleLinkNames = () =>
  screen
    .getAllByRole('link')
    .map((link) => link.textContent ?? '')
    .filter((text) => text !== 'Learn more');

describe('PipelineListPage', () => {
  it('renders every drained page and skips agent pipelines', async () => {
    renderList();

    await waitFor(() => {
      expect(screen.getByText('nightly-export')).toBeInTheDocument();
    });

    // Default sort puts problems first: error, then running, then stopped.
    expect(visibleLinkNames()).toEqual(['clickstream-sink', 'orders-enrichment', 'nightly-export']);
    expect(screen.queryByText('agent-helper')).not.toBeInTheDocument();
  });

  it('counts each status tab over the drained rows', async () => {
    renderList();

    await waitFor(() => {
      expect(screen.getByText('nightly-export')).toBeInTheDocument();
    });

    expect(tab('All')).toHaveTextContent('3');
    expect(tab('Running')).toHaveTextContent('1');
    expect(tab('Stopped')).toHaveTextContent('1');
    expect(tab('Error')).toHaveTextContent('1');
  });

  it('narrows rows to the selected status tab', async () => {
    const user = userEvent.setup();
    renderList();

    await waitFor(() => {
      expect(screen.getByText('nightly-export')).toBeInTheDocument();
    });

    await user.click(tab('Error'));

    await waitFor(() => {
      expect(visibleLinkNames()).toEqual(['clickstream-sink']);
    });

    await user.click(tab('Stopped'));

    await waitFor(() => {
      expect(visibleLinkNames()).toEqual(['nightly-export']);
    });
  });

  it('filters on name or id, and the tab counts follow the search', async () => {
    const user = userEvent.setup();
    renderList();

    await waitFor(() => {
      expect(screen.getByText('nightly-export')).toBeInTheDocument();
    });

    // Matches an id, not a display name — the search covers both.
    await user.type(screen.getByRole('textbox', { name: SEARCH_INPUT_RE }), 'bbb2');

    await waitFor(() => {
      expect(visibleLinkNames()).toEqual(['clickstream-sink']);
    });
    expect(tab('All')).toHaveTextContent('1');
    expect(tab('Running')).toHaveTextContent('0');

    await user.click(screen.getByRole('button', { name: CLEAR_FILTERS_RE }));

    await waitFor(() => {
      expect(visibleLinkNames()).toHaveLength(3);
    });
  });

  it('shows the tab-specific empty message when a status has no pipelines', async () => {
    const user = userEvent.setup();
    renderList();

    await waitFor(() => {
      expect(screen.getByText('nightly-export')).toBeInTheDocument();
    });

    await user.type(screen.getByRole('textbox', { name: SEARCH_INPUT_RE }), 'orders');
    await user.click(tab('Error'));

    await waitFor(() => {
      expect(screen.getByText('No pipelines match the current filters')).toBeInTheDocument();
    });
  });

  it('labels the status from the pipeline state, not the badge variant', async () => {
    renderList();

    await waitFor(() => {
      expect(screen.getByText('nightly-export')).toBeInTheDocument();
    });

    expect(within(rowFor('orders-enrichment')).getByText('Running')).toBeInTheDocument();
    expect(within(rowFor('clickstream-sink')).getByText('Error')).toBeInTheDocument();
    expect(within(rowFor('nightly-export')).getByText('Stopped')).toBeInTheDocument();
  });

  it('points every status tab at the table region, labelled by the active tab', async () => {
    const user = userEvent.setup();
    renderList();

    await waitFor(() => {
      expect(screen.getByText('nightly-export')).toBeInTheDocument();
    });

    // One panel, filtered per tab, so every tab points at the same region.
    const panel = screen.getByRole('tabpanel');
    expect(panel).toContainElement(rowFor('nightly-export'));
    for (const name of ['All', 'Running', 'Stopped', 'Error']) {
      expect(tab(name)).toHaveAttribute('aria-controls', panel.id);
    }
    expect(panel).toHaveAttribute('aria-labelledby', tab('All').id);

    // The label follows the selection.
    await user.click(tab('Error'));
    await waitFor(() => {
      expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tab('Error').id);
    });
  });

  it('leaves modified clicks to the browser and navigates on a plain one', async () => {
    const user = userEvent.setup();
    const { router } = renderList();

    await waitFor(() => {
      expect(screen.getByText('nightly-export')).toBeInTheDocument();
    });

    // ⌘-click means "open in a new tab": soft-navigating would swallow it.
    const description = within(rowFor('orders-enrichment')).getByText('aaa111');
    await user.keyboard('{Meta>}');
    await user.click(description);
    await user.keyboard('{/Meta}');
    expect(router.state.location.pathname).toBe('/');

    await user.click(description);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/rp-connect/aaa111');
    });
  });

  it('collapses repeated connectors into a single badge with a multiplier', async () => {
    renderList();

    await waitFor(() => {
      expect(screen.getByText('orders-enrichment')).toBeInTheDocument();
    });
    const row = rowFor('orders-enrichment');

    // Two `redpanda` inputs render as one badge carrying ×2.
    expect(within(row).getByText('×2')).toBeInTheDocument();
    expect(within(row).getAllByText('redpanda')).toHaveLength(1);
  });
});
