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
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { createRouterTransport } from '@connectrpc/connect';
import userEvent from '@testing-library/user-event';
import {
  DeletePipelineResponseSchema,
  type ListPipelinesRequest,
  ListPipelinesResponseSchema,
  StartPipelineResponseSchema,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import {
  deletePipeline,
  listPipelines,
  startPipeline,
} from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import {
  ListPipelinesResponseSchema as DataPlaneListPipelinesResponseSchema,
  Pipeline_State,
  PipelineSchema,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useRpcnEditorAutosaveStore } from 'state/rpcn-editor-autosave';
import { renderWithFileRoutes, screen, waitFor, within } from 'test-utils';

const mockIsFeatureFlagEnabled = rs.fn((_flag: string) => false);
rs.mock('config', () => {
  const actual = rs.requireActual<typeof import('config')>('config');
  return {
    ...actual,
    config: { jwt: 'test-jwt-token' },
    isEmbedded: rs.fn(() => false),
    isFeatureFlagEnabled: (...args: unknown[]) => mockIsFeatureFlagEnabled(...(args as [string])),
  };
});

type ListRequest = ListPipelinesRequest;

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
  createdBy?: string;
  updateTime?: ReturnType<typeof timestampFromDate>;
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

// A draft carries an author and an edit time; the id is not shown on its row.
const DRAFT_FIXTURE: Fixture = {
  id: 'draft777',
  displayName: 'half-built-pipeline',
  state: Pipeline_State.DRAFT,
  inputs: ['generate'],
  outputs: [],
  createdBy: 'author@example.com',
  updateTime: timestampFromDate(new Date(Date.now() - 5 * 60 * 1000)),
};

// Two pages, so the test exercises the drain the list renders behind.
const buildTransport = (opts?: {
  withDraft?: boolean;
  extraDrafts?: Fixture[];
  startPipelineMock?: ReturnType<typeof rs.fn>;
  deletePipelineMock?: ReturnType<typeof rs.fn>;
  onRequest?: (req: ListPipelinesRequest) => void;
}) =>
  createRouterTransport(({ rpc }) => {
    rpc(listPipelines, (req) => {
      opts?.onRequest?.(req);
      const pageToken = req.request?.pageToken ?? '';
      const drafts = opts?.withDraft ? [DRAFT_FIXTURE, ...(opts.extraDrafts ?? [])] : [];
      const first = [...drafts, ...FIXTURES.slice(0, 2)];
      const page = pageToken === '' ? first : FIXTURES.slice(2);
      return create(ListPipelinesResponseSchema, {
        response: create(DataPlaneListPipelinesResponseSchema, {
          pipelines: page.map((f) =>
            create(PipelineSchema, {
              id: f.id,
              displayName: f.displayName,
              state: f.state,
              tags: f.tags ?? {},
              configYaml: yamlFor(f),
              createdBy: f.createdBy ?? '',
              updateTime: f.updateTime,
            })
          ),
          nextPageToken: pageToken === '' ? 'page2' : '',
        }),
      });
    });
    rpc(startPipeline, opts?.startPipelineMock ?? rs.fn().mockReturnValue(create(StartPipelineResponseSchema, {})));
    rpc(deletePipeline, opts?.deletePipelineMock ?? rs.fn().mockReturnValue(create(DeletePipelineResponseSchema, {})));
  });

const renderList = (opts?: { withDraft?: boolean }) =>
  renderWithFileRoutes(<PipelineListPage />, { transport: buildTransport(opts) });

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

  describe('drafts', () => {
    beforeEach(() => {
      mockIsFeatureFlagEnabled.mockImplementation((flag: string) => flag === 'enableRpcnPipelineDrafts');
    });

    it('hides the Drafts tab when there are none', async () => {
      renderList();

      await waitFor(() => expect(screen.getByText('orders-enrichment')).toBeInTheDocument());
      expect(screen.queryByRole('tab', { name: /^Drafts/ })).not.toBeInTheDocument();
    });

    // Drafts are excluded from ListPipelines unless asked for, so a client that doesn't understand
    // them never receives a state it would render as a broken pipeline.
    it('asks for drafts only when it can show them', async () => {
      const requests: unknown[] = [];
      renderWithFileRoutes(<PipelineListPage />, { transport: buildTransport({ onRequest: (r) => requests.push(r) }) });

      await waitFor(() => expect(screen.getByText('orders-enrichment')).toBeInTheDocument());
      expect(requests.every((r) => (r as ListRequest).request?.filter?.includeDrafts === true)).toBe(true);

      requests.length = 0;
      mockIsFeatureFlagEnabled.mockImplementation(() => false);
      renderWithFileRoutes(<PipelineListPage />, { transport: buildTransport({ onRequest: (r) => requests.push(r) }) });

      await waitFor(() => expect(requests.length).toBeGreaterThan(0));
      expect(requests.every((r) => !(r as ListRequest).request?.filter?.includeDrafts)).toBe(true);
    });

    it('lists a draft alongside deployed pipelines, marked as a draft', async () => {
      renderList({ withDraft: true });

      await waitFor(() => expect(screen.getByText('half-built-pipeline')).toBeInTheDocument());

      const row = rowFor('half-built-pipeline');
      expect(within(row).getByText('Draft')).toBeInTheDocument();
      // Its connectors are parsed from its YAML like any other row.
      expect(within(row).getByText('generate')).toBeInTheDocument();
      // Drafts sort ahead of deployed pipelines — they're the rows with work still owed.
      expect(visibleLinkNames()[0]).toBe('half-built-pipeline');
    });

    // Age and author rather than the id: what decides whether to pick a draft up or bin it.
    it('says when a draft was last edited and who by', async () => {
      renderList({ withDraft: true });

      await waitFor(() => expect(screen.getByText('half-built-pipeline')).toBeInTheDocument());

      const row = rowFor('half-built-pipeline');
      expect(within(row).getByText(/Edited .* · by author@example\.com/)).toBeInTheDocument();
      expect(within(row).queryByText('draft777')).not.toBeInTheDocument();
    });

    it('opens a draft on its own page, like any other pipeline', async () => {
      renderList({ withDraft: true });

      await waitFor(() => expect(screen.getByText('half-built-pipeline')).toBeInTheDocument());

      const link = within(rowFor('half-built-pipeline')).getByRole('link', { name: 'half-built-pipeline' });
      expect(link).toHaveAttribute('href', expect.stringContaining('/rp-connect/draft777'));
    });

    // The one edited last is the one being worked on.
    it('puts the most recently edited draft first', async () => {
      renderWithFileRoutes(<PipelineListPage />, {
        transport: buildTransport({
          withDraft: true,
          extraDrafts: [
            {
              id: 'draft888',
              displayName: 'older-draft',
              state: Pipeline_State.DRAFT,
              inputs: ['generate'],
              outputs: [],
              updateTime: timestampFromDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)),
            },
          ],
        }),
      });

      await waitFor(() => expect(screen.getByText('older-draft')).toBeInTheDocument());

      expect(visibleLinkNames().slice(0, 2)).toEqual(['half-built-pipeline', 'older-draft']);
    });

    it('counts drafts in their own tab and narrows to them', async () => {
      const user = userEvent.setup();
      renderList({ withDraft: true });

      // Both pages drained (3 pipelines, the agent filtered out) plus the draft.
      await waitFor(() => expect(tab('All')).toHaveTextContent('All4'));
      expect(tab('Drafts')).toHaveTextContent('Drafts1');
      // A draft is never counted as a run state.
      expect(tab('Stopped')).toHaveTextContent('Stopped1');

      await user.click(tab('Drafts'));
      await waitFor(() => expect(visibleLinkNames()).toEqual(['half-built-pipeline']));
    });

    it('starts a draft from its row', async () => {
      const user = userEvent.setup();
      const startPipelineMock = rs.fn().mockReturnValue(create(StartPipelineResponseSchema, {}));
      renderWithFileRoutes(<PipelineListPage />, {
        transport: buildTransport({ withDraft: true, startPipelineMock }),
      });

      await waitFor(() => expect(screen.getByText('half-built-pipeline')).toBeInTheDocument());

      await user.click(within(rowFor('half-built-pipeline')).getByRole('button', { name: /open menu/i }));
      await user.click(await screen.findByRole('menuitem', { name: 'Start' }));

      await waitFor(() => expect(startPipelineMock).toHaveBeenCalled());
      expect(startPipelineMock.mock.calls[0][0].request.id).toBe('draft777');
    });

    it('deletes a draft from its row, after a confirmation', async () => {
      const user = userEvent.setup();
      const deletePipelineMock = rs.fn().mockReturnValue(create(DeletePipelineResponseSchema, {}));
      renderWithFileRoutes(<PipelineListPage />, {
        transport: buildTransport({ withDraft: true, deletePipelineMock }),
      });

      await waitFor(() => expect(screen.getByText('half-built-pipeline')).toBeInTheDocument());

      await user.click(within(rowFor('half-built-pipeline')).getByRole('button', { name: /open menu/i }));
      await user.click(await screen.findByRole('menuitem', { name: /delete draft/i }));

      // Confirmed, but without the type-to-confirm the deployed-pipeline dialog demands.
      expect(await screen.findByText(/delete draft\?/i)).toBeInTheDocument();
      expect(deletePipelineMock).not.toHaveBeenCalled();

      await user.click(screen.getByTestId('confirm-delete-draft'));

      await waitFor(() => expect(deletePipelineMock).toHaveBeenCalled());
      expect(deletePipelineMock.mock.calls[0][0].request.id).toBe('draft777');
    });

    // The dialog's line about unsaved edits is only true when this browser holds a buffer for the draft.
    it('says when deleting the draft also drops edits this browser was keeping', async () => {
      const user = userEvent.setup();
      localStorage.clear();
      useRpcnEditorAutosaveStore.getState().save({
        targetKey: 'draft777',
        name: 'half-built-pipeline',
        description: '',
        computeUnits: 1,
        tags: [],
        configYaml: 'input:\n  generate: {}\n# half way through',
      });
      renderList({ withDraft: true });

      await waitFor(() => expect(screen.getByText('half-built-pipeline')).toBeInTheDocument());
      await user.click(within(rowFor('half-built-pipeline')).getByRole('button', { name: /open menu/i }));
      await user.click(await screen.findByRole('menuitem', { name: /delete draft/i }));

      expect(await screen.findByText(/your unsaved changes go with it/i)).toBeInTheDocument();
      useRpcnEditorAutosaveStore.getState().clearAll();
    });

    // Nothing is running, so there is nothing to stop.
    it('offers no Stop on a draft', async () => {
      const user = userEvent.setup();
      renderList({ withDraft: true });

      await waitFor(() => expect(screen.getByText('half-built-pipeline')).toBeInTheDocument());

      await user.click(within(rowFor('half-built-pipeline')).getByRole('button', { name: /open menu/i }));

      expect(await screen.findByRole('menuitem', { name: 'Continue editing' })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Stop' })).not.toBeInTheDocument();
    });
  });
});
