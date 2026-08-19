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

import { DiffEditor } from '@monaco-editor/react';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Badge, type BadgeTone } from 'components/redpanda-ui/components/badge';
import { CountDot } from 'components/redpanda-ui/components/count-dot';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { CheckCircle2, Info, MousePointerClick, TriangleAlert } from 'lucide-react';
import type { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import { DIFF_THEME, defineDiffTheme } from './changes-diff-theme';
import {
  type ChangeKind,
  type ComponentChange,
  changesImpactMessage,
  changesImpactTone,
  noChangesCopy,
} from './changes-summary';

/**
 * Read-only comparison of the saved configuration against the editor's buffer: what am I about to do to
 * this pipeline, before the answer is a restart.
 */

const KIND_LABEL: Record<ChangeKind, string> = {
  added: 'Added',
  removed: 'Removed',
  changed: 'Changed',
};

// Removals read as destructive, additions as positive, edits as informative.
const KIND_TONE: Record<ChangeKind, BadgeTone> = {
  added: 'success',
  removed: 'destructive',
  changed: 'info',
};

const DIFF_OPTIONS = {
  readOnly: true,
  domReadOnly: true,
  // Falls back to the inline view under 900px by itself, which is why the copy never says "left".
  renderSideBySide: true,
  // The interesting change is usually a handful of lines in a long document.
  hideUnchangedRegions: { enabled: true },
  renderOverviewRuler: false,
  // Read-only, so the revert arrows do nothing — and their margin is a stripe between the panes.
  renderMarginRevertIcon: false,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  // The panes are half a lane wide, so a long line clips exactly where the change is.
  wordWrap: 'on',
  fontSize: 12,
  lineNumbersMinChars: 3,
  glyphMargin: false,
  folding: false,
  // useShadows off: the bars Monaco casts at a scrollable edge read as layout borders.
  scrollbar: { alwaysConsumeMouseWheel: false, useShadows: false },
} as const;

// Monaco is loaded lazily, so the lane has a beat with nothing in it.
const DIFF_LOADING = (
  <div className="flex h-full items-center justify-center">
    <Spinner className="size-6 text-muted-foreground" />
  </div>
);

/**
 * One touched component, clickable to reveal it in the YAML lane. A plain button rather than a ghost
 * `Button`, whose padding, height and link colour all had to be overridden to make a dense row —
 * matching `PipelineProblemsPanel`, the other jump-to-a-node list here.
 */
const ComponentChangeRow = ({ change, onSelect }: { change: ComponentChange; onSelect?: (id: string) => void }) => {
  const description = [change.section, change.label].filter(Boolean).join(' · ') || change.id;
  const body = (
    <>
      <Badge className="shrink-0" size="sm" tone={KIND_TONE[change.kind]} variant="subtle">
        {KIND_LABEL[change.kind]}
      </Badge>
      <span className="min-w-0 truncate text-body-sm text-foreground">{description}</span>
    </>
  );
  return (
    <li>
      {onSelect ? (
        <button
          className="group flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
          onClick={() => onSelect(change.id)}
          title={`Show ${description} in the YAML`}
          type="button"
        >
          {body}
          <MousePointerClick className="ml-auto size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      ) : (
        <div className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left">{body}</div>
      )}
    </li>
  );
};

export function ChangesPanel({
  savedYaml,
  editedYaml,
  changes,
  mode,
  pipelineState,
  onSelectComponent,
}: {
  /** The configuration as saved — the deployed pipeline, or the draft as last stored. */
  savedYaml: string;
  editedYaml: string;
  changes: ComponentChange[];
  mode: 'create' | 'edit';
  pipelineState?: Pipeline_State;
  /** Jumps to a component in the YAML lane. */
  onSelectComponent?: (id: string) => void;
}) {
  const hasChanges = editedYaml !== savedYaml;

  if (!hasChanges) {
    const { title, body } = noChangesCopy(mode);
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center"
        data-testid="changes-panel-empty"
      >
        <CheckCircle2 className="size-5 text-success" />
        <p className="text-body">{title}</p>
        <p className="max-w-prose text-body-sm text-muted-foreground">{body}</p>
      </div>
    );
  }

  const tone = changesImpactTone(pipelineState, mode);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="changes-panel">
      <div className="flex shrink-0 flex-col gap-2 border-border! border-b p-3">
        <Alert
          icon={tone === 'warning' ? <TriangleAlert /> : <Info />}
          testId="changes-impact"
          variant={tone === 'warning' ? 'warning' : 'info'}
        >
          <AlertDescription>{changesImpactMessage(pipelineState, mode)}</AlertDescription>
        </Alert>
        {/* Keyed on the gutter markers, not on colour or on which side is which — the diff drops to a
            single inline pane on a narrow lane. */}
        <p className="text-body-sm text-muted-foreground">
          <span className="font-mono">-</span> the saved configuration · <span className="font-mono">+</span> your
          unsaved edits
        </p>
      </div>
      <div className="flex min-h-0 flex-1">
        {changes.length > 0 ? (
          <div className="w-70 shrink-0 overflow-auto border-border! border-r p-2">
            <div className="flex items-center gap-2 px-2 pb-1">
              <h5 className="text-heading-xs text-muted-foreground">Components</h5>
              <CountDot count={changes.length} size="sm" variant="info" />
            </div>
            <ul className="flex flex-col">
              {changes.map((change) => (
                <ComponentChangeRow change={change} key={`${change.kind}-${change.id}`} onSelect={onSelectComponent} />
              ))}
            </ul>
          </div>
        ) : null}
        {/* Out of flow so Monaco can't feed its width up the layout and latch the page wide. */}
        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-0">
            <DiffEditor
              beforeMount={defineDiffTheme}
              language="yaml"
              loading={DIFF_LOADING}
              modified={editedYaml}
              options={DIFF_OPTIONS}
              original={savedYaml}
              theme={DIFF_THEME}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
