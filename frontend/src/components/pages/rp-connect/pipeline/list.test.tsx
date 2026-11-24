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
import { createRouterTransport, type MethodImpl } from '@connectrpc/connect';
import userEvent from '@testing-library/user-event';
import { config, createAuthInjectingFetch } from 'config';
import { HttpResponse, http } from 'msw';
import { HttpNetworkFrame } from 'msw/experimental';
import { setupServer } from 'msw/node';
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
import { appGlobal } from 'state/app-global';
import { useApiStore } from 'state/backend-api';
import type { KafkaConnectors } from 'state/rest-interfaces';
import { useRpcnEditorAutosaveStore } from 'state/rpcn-editor-autosave';
import { cleanup, renderWithFileRoutes, screen, waitFor, within } from 'test-utils';

import { PipelineListPage } from './list';

const initialConfig = { featureFlags: config.featureFlags, jwt: config.jwt };
const originalRestFetch = config.fetch;
const guardedFetch = globalThis.fetch;
const { connectConnectors, connectConnectorsError } = useApiStore.getState();
const connectorsUrl = new URL(`${config.restBasePath}/kafka-connect/connectors`, window.location.href).href;
const rest = setupServer(
  http.get(connectorsUrl, () => HttpResponse.json({ clusters: null, isConfigured: false } satisfies KafkaConnectors))
);

beforeAll(() => {
  rest.listen({
    async onUnhandledFrame({ frame }) {
      if (frame instanceof HttpNetworkFrame) {
        await guardedFetch(frame.data.request);
      }
      throw new Error('Unexpected network frame in the pipeline list');
    },
  });
  config.fetch = createAuthInjectingFetch(globalThis.fetch);
});

afterAll(() => {
  config.fetch = originalRestFetch;
  rest.close();
});

function setDraftsEnabled(enabled: boolean) {
  config.featureFlags = { ...config.featureFlags, enableRpcnPipelineDrafts: enabled };
}

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
    inputs: ['sql_select'],
    outputs: ['gcp_cloud_storage'],
  },
  {
    id: 'ddd444',
    displayName: 'agent-helper',
    state: Pipeline_State.RUNNING,
    inputs: ['generate'],
    outputs: ['s3'],
    tags: { __redpanda_cloud_pipeline_type: 'agent' },
  },
];

const DRAFT_TEST_NOW = Date.UTC(2026, 0, 15, 12);

const DRAFT_FIXTURE: Fixture = {
  id: 'draft777',
  displayName: 'half-built-pipeline',
  state: Pipeline_State.DRAFT,
  inputs: ['generate'],
  outputs: [],
  createdBy: 'author@example.com',
  updateTime: timestampFromDate(new Date(DRAFT_TEST_NOW - 5 * 60 * 1000)),
};

const buildTransport = (opts?: {
  pipelines?: Fixture[];
  withDraft?: boolean;
  extraDrafts?: Fixture[];
  startPipelineHandler?: MethodImpl<typeof startPipeline>;
  deletePipelineHandler?: MethodImpl<typeof deletePipeline>;
  onRequest?: (req: ListPipelinesRequest) => void;
}) =>
  createRouterTransport(({ rpc }) => {
    rpc(listPipelines, (req) => {
      opts?.onRequest?.(req);
      const pageToken = req.request?.pageToken ?? '';
      const pipelines = opts?.pipelines ?? FIXTURES;
      const drafts = opts?.withDraft ? [DRAFT_FIXTURE, ...(opts.extraDrafts ?? [])] : [];
      const first = [...drafts, ...pipelines.slice(0, 2)];
      const page = pageToken === '' ? first : pipelines.slice(2);
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
    rpc(startPipeline, opts?.startPipelineHandler ?? (() => create(StartPipelineResponseSchema, {})));
    rpc(deletePipeline, opts?.deletePipelineHandler ?? (() => create(DeletePipelineResponseSchema, {})));
  });

const renderList = (opts?: Parameters<typeof buildTransport>[0]) =>
  renderWithFileRoutes(<PipelineListPage />, { transport: buildTransport(opts) });

const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(`^${name}`, 'u') });

const rowFor = (displayName: string) => {
  const row = screen.getByText(displayName).closest('tr');
  if (!row) {
    throw new Error(`no row for ${displayName}`);
  }
  return row;
};

const OPEN_MENU_RE = /open menu/iu;
const START_DRAFT_CONFIRM_RE = /can't go back to being a draft/u;
const DRAFTS_TAB_RE = /^Drafts/u;
const DELETE_DRAFT_RE = /delete draft/iu;
const DELETE_DRAFT_CONFIRM_RE = /delete draft\?/iu;
const SEARCH_INPUT_RE = /search pipelines/iu;
const UNTIL_DONE_RE = /Until done/u;
const CLEAR_FILTERS_RE = /clear filters/iu;

const openDraftMenu = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(within(rowFor('half-built-pipeline')).getByRole('button', { name: OPEN_MENU_RE }));

const openDraftRowMenuItem = async (user: ReturnType<typeof userEvent.setup>, item: RegExp) => {
  await openDraftMenu(user);
  await user.click(await screen.findByRole('menuitem', { name: item }));
};

async function confirmStartDraft(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('menuitem', { name: 'Start' }));
  expect(await screen.findByText(START_DRAFT_CONFIRM_RE)).toBeInTheDocument();
  await user.click(screen.getByTestId('confirm-start-draft'));
}

const visibleLinkNames = () =>
  screen
    .getAllByRole('link')
    .map((link) => link.textContent ?? '')
    .filter((text) => text !== 'Learn more');

describe('the PipelineListPage', () => {
  beforeEach(() => {
    config.jwt = undefined;
    setDraftsEnabled(false);
  });

  afterEach(() => {
    cleanup();
    Object.assign(config, initialConfig);
    useApiStore.setState({ connectConnectors, connectConnectorsError });
  });

  describe('rows', () => {
    it('renders every drained page and skips agent pipelines', async () => {
      renderList();

      await waitFor(() => {
        expect(screen.getByText('nightly-export')).toBeInTheDocument();
      });

      expect(visibleLinkNames()).toEqual(['clickstream-sink', 'orders-enrichment', 'nightly-export']);
      expect(screen.queryByText('agent-helper')).not.toBeInTheDocument();
    });

    it('refetches the list from the header refresh button', async () => {
      const requests: ListPipelinesRequest[] = [];
      renderWithFileRoutes(<PipelineListPage />, {
        transport: buildTransport({ onRequest: (req) => requests.push(req) }),
      });

      expect(await screen.findByText('nightly-export')).toBeInTheDocument();
      const drained = requests.length;

      appGlobal.onRefresh();

      await waitFor(() => expect(requests.length).toBeGreaterThan(drained));
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

    it('collapses repeated connectors into a single badge with a multiplier', async () => {
      renderList();

      await waitFor(() => {
        expect(screen.getByText('orders-enrichment')).toBeInTheDocument();
      });
      const row = rowFor('orders-enrichment');

      expect(within(row).getByText('×2')).toBeInTheDocument();
      expect(within(row).getAllByText('redpanda')).toHaveLength(1);
    });
  });

  describe('status tabs', () => {
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

    it('points every status tab at the table region, labelled by the active tab', async () => {
      const user = userEvent.setup();
      renderList();

      await waitFor(() => {
        expect(screen.getByText('nightly-export')).toBeInTheDocument();
      });

      const panel = screen.getByRole('tabpanel');
      expect(panel).toContainElement(rowFor('nightly-export'));
      for (const name of ['All', 'Running', 'Stopped', 'Error']) {
        expect(tab(name)).toHaveAttribute('aria-controls', panel.id);
      }
      expect(panel).toHaveAttribute('aria-labelledby', tab('All').id);

      await user.click(tab('Error'));
      await waitFor(() => {
        expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tab('Error').id);
      });
    });
  });

  describe('search and row clicks', () => {
    it('filters on name or id, and the tab counts follow the search', async () => {
      const user = userEvent.setup();
      renderList();

      await waitFor(() => {
        expect(screen.getByText('nightly-export')).toBeInTheDocument();
      });

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

    it('leaves modified clicks to the browser and navigates on a plain one', async () => {
      const user = userEvent.setup();
      const { router } = renderList();

      await waitFor(() => {
        expect(screen.getByText('nightly-export')).toBeInTheDocument();
      });

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
  });

  describe('pagination', () => {
    const MANY_PIPELINES: Fixture[] = [
      { id: 'err000', displayName: 'first-error', state: Pipeline_State.ERROR, inputs: ['generate'], outputs: ['s3'] },
      ...Array.from({ length: 33 }, (_, i) => ({
        id: `run${String(i).padStart(3, '0')}`,
        displayName: `running-${String(i).padStart(2, '0')}`,
        state: Pipeline_State.RUNNING,
        inputs: ['generate'],
        outputs: ['s3'],
      })),
      {
        id: 'stp000',
        displayName: 'last-stopped',
        state: Pipeline_State.STOPPED,
        inputs: ['generate'],
        outputs: ['s3'],
      },
    ];

    const renderManyPipelines = async () => {
      renderWithFileRoutes(<PipelineListPage />, { transport: buildTransport({ pipelines: MANY_PIPELINES }) });
      expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
    };

    const expectPage = async (page: 1 | 2) => {
      await waitFor(() => {
        expect(screen.getByText(`Page ${page} of 2`)).toBeInTheDocument();
      });
      expect(visibleLinkNames()).toHaveLength(page === 1 ? 20 : 15);
      expect(visibleLinkNames().includes('first-error')).toBe(page === 1);
      expect(visibleLinkNames().includes('last-stopped')).toBe(page === 2);
    };

    const goToPage = async (user: ReturnType<typeof userEvent.setup>, control: string, page: 1 | 2) => {
      await user.click(screen.getByRole('button', { name: control }));
      await expectPage(page);
    };

    it('moves between pages from the footer controls', async () => {
      const user = userEvent.setup();
      await renderManyPipelines();
      await expectPage(1);

      await goToPage(user, 'Go to next page', 2);
      await goToPage(user, 'Go to first page', 1);
      await goToPage(user, 'Go to last page', 2);
      await goToPage(user, 'Go to previous page', 1);
    });

    it('shows more rows per page when asked', async () => {
      const user = userEvent.setup();
      await renderManyPipelines();

      await user.click(screen.getByRole('combobox', { name: 'Rows per page' }));
      await user.click(await screen.findByRole('option', { name: '50' }));
      await waitFor(() => expect(screen.getByText('Page 1 of 1')).toBeInTheDocument());
      expect(visibleLinkNames()).toHaveLength(35);
      expect(screen.getByRole('combobox', { name: 'Rows per page' })).toHaveTextContent('50');
    });

    it('goes back to page 1 when the filters change', async () => {
      const user = userEvent.setup();
      await renderManyPipelines();

      await user.click(screen.getByRole('button', { name: 'Go to last page' }));
      await expectPage(2);

      await user.click(tab('Running'));
      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      });
    });

    it('goes back to page 1 when the sort changes', async () => {
      const user = userEvent.setup();
      await renderManyPipelines();

      await user.click(screen.getByRole('button', { name: 'Go to last page' }));
      await expectPage(2);

      await user.click(screen.getByRole('button', { name: 'Pipeline' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Asc' }));
      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      });
    });
  });

  it('says whether each pipeline stops on its own, and filters on it', async () => {
    const user = userEvent.setup();
    renderList();
    await waitFor(() => expect(screen.getByText('nightly-export')).toBeInTheDocument());

    expect(within(rowFor('nightly-export')).getByText('Until done')).toBeInTheDocument();
    expect(within(rowFor('orders-enrichment')).getByText('Continuously')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Runs' }));
    await user.click(await screen.findByRole('option', { name: UNTIL_DONE_RE }));
    await waitFor(() => expect(visibleLinkNames()).toEqual(['nightly-export']));
  });

  describe('drafts', () => {
    beforeEach(() => {
      rs.setSystemTime(DRAFT_TEST_NOW);
      setDraftsEnabled(true);
    });

    afterEach(() => {
      rs.useRealTimers();
    });

    describe('listing drafts', () => {
      it('hides the Drafts tab when there are none', async () => {
        renderList();

        await waitFor(() => expect(screen.getByText('orders-enrichment')).toBeInTheDocument());
        expect(screen.queryByRole('tab', { name: DRAFTS_TAB_RE })).not.toBeInTheDocument();
      });

      it('requests drafts on every page whether their creation is enabled or not', async () => {
        const requests: ListPipelinesRequest[] = [];
        const { unmount } = renderList({ onRequest: (request) => requests.push(request) });
        await screen.findByText('nightly-export');
        expect(requests.map((request) => request.request?.filter?.includeDrafts)).toEqual([true, true]);
        unmount();

        requests.length = 0;
        setDraftsEnabled(false);
        renderList({ onRequest: (request) => requests.push(request) });
        await screen.findByText('nightly-export');
        expect(requests.map((request) => request.request?.filter?.includeDrafts)).toEqual([true, true]);
      });

      it('lists a draft alongside deployed pipelines, marked as a draft', async () => {
        renderList({ withDraft: true });

        await waitFor(() => expect(screen.getByText('half-built-pipeline')).toBeInTheDocument());

        const row = rowFor('half-built-pipeline');
        expect(within(row).getByText('Draft')).toBeInTheDocument();
        expect(within(row).getByText('generate')).toBeInTheDocument();
        expect(visibleLinkNames()).toEqual([
          'clickstream-sink',
          'orders-enrichment',
          'half-built-pipeline',
          'nightly-export',
        ]);
      });

      it('says when a draft was last edited, and nothing about who', async () => {
        renderList({ withDraft: true });

        await waitFor(() => expect(screen.getByText('half-built-pipeline')).toBeInTheDocument());

        const row = rowFor('half-built-pipeline');
        expect(within(row).getByText(/^Edited .* ago$/u)).toBeInTheDocument();
        expect(within(row).queryByText(/author@example\.com/u)).not.toBeInTheDocument();
        expect(within(row).queryByText('draft777')).not.toBeInTheDocument();
      });

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
                updateTime: timestampFromDate(new Date(DRAFT_TEST_NOW - 3 * 24 * 60 * 60 * 1000)),
              },
            ],
          }),
        });

        await waitFor(() => expect(screen.getByText('older-draft')).toBeInTheDocument());

        const names = visibleLinkNames();
        expect(names.indexOf('half-built-pipeline')).toBeLessThan(names.indexOf('older-draft'));
      });

      it('counts drafts in their own tab and narrows to them', async () => {
        const user = userEvent.setup();
        renderList({ withDraft: true });

        await waitFor(() => expect(tab('All')).toHaveTextContent('All4'));
        expect(tab('Drafts')).toHaveTextContent('Drafts1');
        expect(tab('Stopped')).toHaveTextContent('Stopped1');

        await user.click(tab('Drafts'));
        await waitFor(() => expect(visibleLinkNames()).toEqual(['half-built-pipeline']));
      });
    });

    describe('draft row actions', () => {
      it('opens a draft on its own page, like any other pipeline', async () => {
        renderList({ withDraft: true });

        await waitFor(() => expect(screen.getByText('half-built-pipeline')).toBeInTheDocument());

        const link = within(rowFor('half-built-pipeline')).getByRole('link', { name: 'half-built-pipeline' });
        expect(link).toHaveAttribute('href', expect.stringContaining('/rp-connect/draft777'));
      });

      it('offers edit and start but no stop on a draft, and starts it after confirmation', async () => {
        const user = userEvent.setup();
        const started: (string | undefined)[] = [];
        renderList({
          withDraft: true,
          startPipelineHandler(request) {
            started.push(request.request?.id);
            return create(StartPipelineResponseSchema, {});
          },
        });
        await screen.findByText('half-built-pipeline');

        await openDraftMenu(user);
        expect(await screen.findByRole('menuitem', { name: 'Continue editing' })).toBeInTheDocument();
        expect(screen.queryByRole('menuitem', { name: 'Stop' })).not.toBeInTheDocument();
        await confirmStartDraft(user);

        await waitFor(() => expect(started).toEqual(['draft777']));
      });

      it('lists and lets users delete a leftover draft while draft creation is disabled', async () => {
        const user = userEvent.setup();
        const deleted: (string | undefined)[] = [];
        setDraftsEnabled(false);
        renderList({
          withDraft: true,
          deletePipelineHandler(request) {
            deleted.push(request.request?.id);
            return create(DeletePipelineResponseSchema, {});
          },
        });
        expect(await screen.findByRole('tab', { name: DRAFTS_TAB_RE })).toBeInTheDocument();
        await openDraftRowMenuItem(user, DELETE_DRAFT_RE);
        expect(await screen.findByText(DELETE_DRAFT_CONFIRM_RE)).toBeInTheDocument();
        expect(deleted).toHaveLength(0);

        await user.click(screen.getByTestId('confirm-delete-draft'));
        await waitFor(() => expect(deleted).toEqual(['draft777']));
      });

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
        await openDraftRowMenuItem(user, DELETE_DRAFT_RE);

        expect(await screen.findByText(/your unsaved changes go with it/iu)).toBeInTheDocument();
        useRpcnEditorAutosaveStore.getState().clearAll();
      });
    });
  });
});

describe('the PipelineListPage view in the URL', () => {
  it('restores a linked view: its tab, search and facets', async () => {
    renderWithFileRoutes(<PipelineListPage />, {
      transport: buildTransport(),
      initialLocation: `/?tab=running&q=orders&input=${encodeURIComponent(JSON.stringify(['redpanda']))}`,
    });
    await waitFor(() => expect(visibleLinkNames()).toEqual(['orders-enrichment']));
    expect(tab('Running')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: SEARCH_INPUT_RE })).toHaveValue('orders');
    expect(screen.getByRole('button', { name: CLEAR_FILTERS_RE })).toBeInTheDocument();
  });

  it('writes the tab to the URL', async () => {
    const user = userEvent.setup();
    const { router } = renderList();
    await waitFor(() => expect(screen.getByText('nightly-export')).toBeInTheDocument());

    await user.click(tab('Stopped'));
    expect(router.state.location.search).toMatchObject({ tab: 'stopped' });
  });

  it('writes the search to the URL, and drops the default tab and a cleared search', async () => {
    const user = userEvent.setup();
    const { router } = renderList();
    await waitFor(() => expect(screen.getByText('nightly-export')).toBeInTheDocument());

    await user.click(tab('Stopped'));
    await user.click(tab('All'));
    await user.type(screen.getByRole('textbox', { name: SEARCH_INPUT_RE }), 'night');
    await waitFor(() => expect(router.state.location.search).toEqual({ q: 'night' }));

    await user.click(screen.getByRole('button', { name: CLEAR_FILTERS_RE }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(screen.getByRole('textbox', { name: SEARCH_INPUT_RE })).toHaveValue('');
  });
});
