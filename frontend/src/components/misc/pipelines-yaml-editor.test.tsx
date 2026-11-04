import { expect, onTestFinished, rs, test } from '@rstest/core';
import { render, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';

import PipelinesYamlEditor from './pipelines-yaml-editor';

const { yamlUpdate } = rs.hoisted(() => ({ yamlUpdate: rs.fn() }));

rs.mock('monaco-yaml', () => ({
  configureMonacoYaml: () => ({ update: yamlUpdate, dispose: () => undefined }),
}));
rs.mock('react-query/api/connect', () => ({
  useListComponentsQuery: () => ({ data: { components: {} } }),
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

  render(<PipelinesYamlEditor />);

  await waitFor(() => expect(reportError).toHaveBeenCalledWith(failure));
});
