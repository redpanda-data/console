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

import { DiffEditor, type Monaco } from '@monaco-editor/react';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Badge, type BadgeTone } from 'components/redpanda-ui/components/badge';
import { CountDot } from 'components/redpanda-ui/components/count-dot';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { CheckCircle2, Info, MousePointerClick, TriangleAlert } from 'lucide-react';
import type { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import {
  type ChangeKind,
  type ComponentChange,
  changesImpactMessage,
  changesImpactTone,
  noChangesCopy,
} from './changes-summary';

/**
 * Read-only comparison of the saved configuration against the editor's buffer.
 *
 * Its job is to answer "what am I about to do to this pipeline" before the answer is a restart. On a
 * running pipeline there is no apply-later, so this is the only place the change can be inspected as a
 * whole rather than one visible screenful of YAML at a time.
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

/**
 * Monaco cannot read our CSS custom properties, so rather than hand-mapping the palette to hex — which
 * would drift the moment the theme changes — this only clears the chrome Monaco paints on its own. The
 * panel's own surface then shows through and the diff sits on it, the same trick `kowl-transparent`
 * plays for the YAML lanes. The red/green of the diff itself is left to Monaco's base theme, which is
 * what a diff is expected to look like anyway.
 */
const DIFF_THEME = 'rpcn-changes-diff';

const defineDiffTheme = (monaco: Monaco) =>
  monaco.editor.defineTheme(DIFF_THEME, {
    base: 'vs',
    inherit: true,
    colors: {
      'editor.background': '#00000000',
      'editorGutter.background': '#00000000',
      // The collapsed-region strip, otherwise a filled grey band across our surface.
      'diffEditor.unchangedRegionBackground': '#00000000',
    },
    rules: [],
  });

const DIFF_OPTIONS = {
  readOnly: true,
  domReadOnly: true,
  // Below Monaco's own breakpoint (900px) this falls back to the inline view by itself, which is why
  // the copy below never says "left" or "right".
  renderSideBySide: true,
  // The interesting change is usually a handful of lines in a long document.
  hideUnchangedRegions: { enabled: true },
  renderOverviewRuler: false,
  // Nothing here is editable, so the revert arrows would be an affordance that does nothing — and
  // their margin is a stripe of chrome between the two panes.
  renderMarginRevertIcon: false,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  // The panes are half a lane wide, so a long line (a commented-out field, an interpolation) would
  // otherwise be clipped exactly where the change is. Wrapping is worth more than aligned line rows.
  wordWrap: 'on',
  fontSize: 12,
  lineNumbersMinChars: 3,
  glyphMargin: false,
  folding: false,
  // useShadows: the dark vertical bars Monaco casts at a scrollable edge, which read as borders that
  // belong to the layout. Same setting the read-only YAML view uses.
  scrollbar: { alwaysConsumeMouseWheel: false, useShadows: false },
} as const;

// Monaco is loaded lazily, so the lane has a beat with nothing in it.
const DIFF_LOADING = (
  <div className="flex h-full items-center justify-center">
    <Spinner className="size-6 text-muted-foreground" />
  </div>
);

/**
 * One touched component, clickable to reveal it in the YAML lane.
 *
 * A plain button rather than a ghost `Button`: this is a dense list row, and the component's own
 * padding, height and link-coloured label all had to be overridden to make it one — which also put the
 * label in the same blue as its badge. Matches `PipelineProblemsPanel`'s rows, the other jump-to-a-node
 * list in this editor.
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
        {/* Keyed on the gutter markers Monaco already renders, rather than on colour or on which side
            is which: it drops to a single inline pane on a narrow lane, and colour alone is not a
            legend. */}
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
