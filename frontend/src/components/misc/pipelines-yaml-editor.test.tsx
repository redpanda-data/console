import { createRouterTransport } from '@connectrpc/connect';
import { expect, onTestFinished, rs, test } from '@rstest/core';
import { PipelineService } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useEffect, useState } from 'react';
import { render, waitFor } from 'test-utils';

import PipelinesYamlEditor from './pipelines-yaml-editor';

const { yamlUpdate } = rs.hoisted(() => ({ yamlUpdate: rs.fn() }));

rs.mock('monaco-yaml', () => ({
  configureMonacoYaml: () => ({ update: yamlUpdate, dispose: () => undefined }),
}));
rs.mock('./monaco-editor', () => ({ default: MockEditor }));

const MONACO_STUB = { editor: { defineTheme: () => undefined, setTheme: () => undefined } };

// Monaco calls beforeMount once, with its instance; the page passes a new callback on every render.
function MockEditor({ beforeMount }: { beforeMount: (monaco: typeof MONACO_STUB) => void }) {
  const [mountMonaco] = useState(() => beforeMount);
  useEffect(
    function runBeforeMount() {
      mountMonaco(MONACO_STUB);
    },
    [mountMonaco]
  );
  return null;
}

test('reports a failed field documentation refresh', async () => {
  const failure = new Error('YAML worker unavailable');
  yamlUpdate.mockRejectedValue(failure);
  const reportError = rs.fn();
  rs.stubGlobal('reportError', reportError);
  onTestFinished(() => {
    rs.unstubAllGlobals();
  });

  const transport = createRouterTransport(({ rpc }) => {
    rpc(PipelineService.method.listComponents, () => ({ components: {} }));
  });
  render(<PipelinesYamlEditor />, { transport });

  await waitFor(() => expect(reportError).toHaveBeenCalledWith(failure));
});
