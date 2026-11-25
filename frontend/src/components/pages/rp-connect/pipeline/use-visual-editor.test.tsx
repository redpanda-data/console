import { expect, rs, test } from '@rstest/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense, startTransition, use, useState } from 'react';

import { PipelineEditorProvider, usePipelineEditorStoreApi } from './use-pipeline-editor-store';
import { useInspectorSelection } from './use-visual-editor';

const COMMITTED_YAML = 'input:\n  stdin: {}\noutput:\n  stdout: {}\n';
const TRANSITION_YAML = 'input:\n  generate: { count: 1 }\noutput:\n  drop: {}\n';
const INSPECTOR_EDIT = '# pending inspector edit\n';

type SuspendedTransition = {
  attempted: ReturnType<typeof Promise.withResolvers<void>>;
  blocked: ReturnType<typeof Promise.withResolvers<void>>;
};

function TransitionBoundary({ yaml, transition }: { yaml: string; transition: SuspendedTransition }) {
  if (yaml === TRANSITION_YAML) {
    transition.attempted.resolve();
    use(transition.blocked.promise);
  }
  return null;
}

function InspectorDocument({
  yaml,
  onYamlChange,
  onCommit,
  transition,
}: {
  yaml: string;
  onYamlChange: (next: string) => void;
  onCommit: (yaml: string) => void;
  transition: SuspendedTransition;
}) {
  const { commitRef } = useInspectorSelection(yaml, onYamlChange);
  return (
    <>
      <output data-testid="committed-yaml">{yaml}</output>
      <button
        onClick={() => {
          let dirty = true;
          commitRef.current = {
            commit(current) {
              onCommit(current);
              if (!dirty) {
                return current;
              }
              dirty = false;
              return current + INSPECTOR_EDIT;
            },
            discard() {
              dirty = false;
            },
          };
        }}
        type="button"
      >
        Stage inspector edit
      </button>
      <TransitionBoundary transition={transition} yaml={yaml} />
    </>
  );
}

function ConcurrentEditor({
  transition,
  onCommit,
}: {
  transition: SuspendedTransition;
  onCommit: (yaml: string) => void;
}) {
  const [yaml, setYaml] = useState(COMMITTED_YAML);
  const store = usePipelineEditorStoreApi();
  return (
    <>
      <button onClick={() => startTransition(() => setYaml(TRANSITION_YAML))} type="button">
        Begin transition
      </button>
      <button
        onClick={() => {
          const flush = store.getState().pendingEditCommit;
          flush?.();
          // Save can flush again in this event: it must see the just-committed edit, not the old prop.
          flush?.();
        }}
        type="button"
      >
        Save inspector edit
      </button>
      <Suspense fallback={<p>Loading next document</p>}>
        <InspectorDocument onCommit={onCommit} onYamlChange={setYaml} transition={transition} yaml={yaml} />
      </Suspense>
    </>
  );
}

async function renderSuspendedEditor() {
  const user = userEvent.setup();
  const transition = { attempted: Promise.withResolvers<void>(), blocked: Promise.withResolvers<void>() };
  const onCommit = rs.fn<(yaml: string) => void>();
  render(
    <PipelineEditorProvider>
      <ConcurrentEditor onCommit={onCommit} transition={transition} />
    </PipelineEditorProvider>
  );
  await user.click(screen.getByRole('button', { name: 'Stage inspector edit' }));
  await act(async () => {
    await user.click(screen.getByRole('button', { name: 'Begin transition' }));
  });
  await transition.attempted.promise;
  return { transition, onCommit };
}

test('saving during a suspended transition edits only the committed document and aborts the speculative YAML', async () => {
  const { transition, onCommit } = await renderSuspendedEditor();
  try {
    expect(screen.getByTestId('committed-yaml').textContent).toBe(COMMITTED_YAML);
    expect(screen.queryByText('Loading next document')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Save inspector edit' }));
    expect(onCommit.mock.calls.map(([yaml]) => yaml)).toStrictEqual([COMMITTED_YAML, COMMITTED_YAML + INSPECTOR_EDIT]);
    expect(screen.getByTestId('committed-yaml').textContent).toBe(COMMITTED_YAML + INSPECTOR_EDIT);
  } finally {
    await act(async () => {
      transition.blocked.resolve();
      await transition.blocked.promise;
    });
  }
  expect(screen.getByTestId('committed-yaml').textContent).toBe(COMMITTED_YAML + INSPECTOR_EDIT);
});
