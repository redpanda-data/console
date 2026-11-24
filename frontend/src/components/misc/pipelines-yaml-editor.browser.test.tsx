// Copyright 2026 Redpanda Data, Inc.

import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import { TransportProvider } from '@connectrpc/connect-query';
import { expect, onTestFinished, test } from '@rstest/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { editor } from 'monaco-editor';
import {
  type ListComponentsResponse,
  ListComponentsResponseSchema,
  PipelineService,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import PipelinesYamlEditor, { type IStandaloneCodeEditor } from './pipelines-yaml-editor';

const SUMMARY = 'Produces synthetic events from a Bloblang mapping.';
const VALID_PIPELINE = "input:\n  generate:\n    mapping: 'root = {}'\noutput:\n  drop: {}";

function renderWithPendingCatalog() {
  const catalog = Promise.withResolvers<ListComponentsResponse>();
  const mounted = Promise.withResolvers<IStandaloneCodeEditor>();
  const transport = createRouterTransport(({ rpc }) => {
    rpc(PipelineService.method.listComponents, () => catalog.promise);
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  onTestFinished(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
  });
  render(
    <TransportProvider transport={transport}>
      <QueryClientProvider client={queryClient}>
        <div style={{ display: 'flex', height: 300, width: 720 }}>
          <PipelinesYamlEditor defaultValue="input: [" onMount={mounted.resolve} />
        </div>
      </QueryClientProvider>
    </TransportProvider>
  );
  return { catalog, mounted, queryClient };
}

const yamlMarkers = () => editor.getModelMarkers({ owner: 'yaml' });

test('shows catalog documentation in the mounted YAML editor after the catalog loads', async () => {
  const { catalog, mounted, queryClient } = renderWithPendingCatalog();
  const instance = await mounted.promise;
  await waitFor(() => expect(yamlMarkers().length).toBeGreaterThan(0));
  instance.setValue(VALID_PIPELINE);
  await waitFor(() => expect(yamlMarkers()).toHaveLength(0));

  catalog.resolve(
    create(ListComponentsResponseSchema, { components: { inputs: [{ name: 'generate', summary: SUMMARY }] } })
  );
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));

  instance.setPosition({ lineNumber: 2, column: 5 });
  await instance.getAction('editor.action.showHover')?.run();
  await waitFor(() => expect(screen.getByText(SUMMARY)).toBeVisible());
});
