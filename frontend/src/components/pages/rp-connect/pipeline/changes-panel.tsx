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
  NO_CHANGES_COPY,
  type SettingsChange,
} from './changes-summary';

/**
 * Read-only comparison of what is saved against what the editor holds — configuration and settings, the
 * two halves a save writes: what am I about to do to this pipeline, before the answer is a restart.
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
  changed: 'informative',
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
 * One row of the change list, clickable to go where it can be edited. A plain button rather than a ghost
 * `Button`, whose padding, height and link colour all had to be overridden to make a dense row —
 * matching `PipelineProblemsPanel`, the other jump-to-a-node list here.
 */
const ChangeRow = ({
  kind,
  title,
  detail,
  actionLabel,
  onSelect,
}: {
  kind: ChangeKind;
  title: string;
  /** Second line — the values for a setting; components say what they are on the first line. */
  detail?: string;
  /** Tooltip on a clickable row, so where it goes is knowable before clicking. */
  actionLabel?: string;
  onSelect?: () => void;
}) => {
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <Badge className="shrink-0" size="sm" tone={KIND_TONE[kind]} variant="subtle">
          {KIND_LABEL[kind]}
        </Badge>
        <span className="min-w-0 truncate text-body-sm text-foreground">{title}</span>
        {onSelect ? (
          <MousePointerClick className="ml-auto size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        ) : null}
      </span>
      {detail ? <span className="truncate pl-0.5 text-body-sm text-muted-foreground">{detail}</span> : null}
    </>
  );
  return (
    <li>
      {onSelect ? (
        <button
          className="group flex w-full cursor-pointer flex-col gap-0.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
          onClick={onSelect}
          title={actionLabel}
          type="button"
        >
          {body}
        </button>
      ) : (
        <div className="flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left">{body}</div>
      )}
    </li>
  );
};

const GroupLabel = ({ children }: { children: string }) => (
  <h6 className="px-2 pt-1 pb-0.5 text-caption text-muted-foreground uppercase">{children}</h6>
);

export function ChangesPanel({
  savedYaml,
  editedYaml,
  changes,
  settingsChanges,
  pipelineState,
  onSelectComponent,
  onEditSettings,
}: {
  /** The configuration as saved — the deployed pipeline, or the draft as last stored. */
  savedYaml: string;
  editedYaml: string;
  changes: ComponentChange[];
  /** Settings are the other half of what a save writes, so they are listed here too. */
  settingsChanges: SettingsChange[];
  pipelineState?: Pipeline_State;
  /** Jumps to a component in the YAML lane. */
  onSelectComponent?: (id: string) => void;
  /** Opens the settings dialog, where a changed setting is edited. */
  onEditSettings?: () => void;
}) {
  const configChanged = editedYaml !== savedYaml;

  if (!(configChanged || settingsChanges.length > 0)) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center"
        data-testid="changes-panel-empty"
      >
        <CheckCircle2 className="size-5 text-success" />
        <p className="text-body">{NO_CHANGES_COPY.title}</p>
        <p className="max-w-prose text-body-sm text-muted-foreground">{NO_CHANGES_COPY.body}</p>
      </div>
    );
  }

  const tone = changesImpactTone(pipelineState);
  // A change with nothing itemisable (a comment, whitespace) still opens the lane, and then the diff
  // takes the full width rather than sitting beside an empty column.
  const itemCount = settingsChanges.length + changes.length;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="changes-panel">
      <div className="shrink-0 p-3">
        <Alert
          icon={tone === 'warning' ? <TriangleAlert /> : <Info />}
          testId="changes-impact"
          variant={tone === 'warning' ? 'warning' : 'informative'}
        >
          <AlertDescription>{changesImpactMessage(pipelineState)}</AlertDescription>
        </Alert>
      </div>
      {/* Column headers on one row, each sitting over the pane it names and sharing its divider, so the
          lane reads as a single table rather than three stacked regions. */}
      <div className="flex shrink-0 items-center border-border! border-b">
        {itemCount > 0 ? (
          <div className="flex w-70 shrink-0 items-center gap-2 self-stretch border-border! border-r px-3 py-2">
            <h5 className="text-heading-xs text-muted-foreground">What changed</h5>
            <CountDot count={itemCount} size="sm" variant="informative" />
          </div>
        ) : null}
        {/* Keyed on the gutter markers, not on colour or on which side is which — the diff drops to a
            single inline pane on a narrow lane. */}
        <p className="min-w-0 flex-1 truncate px-3 py-2 text-body-sm text-muted-foreground">
          {configChanged ? (
            <>
              <span className="font-mono">-</span> the saved configuration · <span className="font-mono">+</span> your
              unsaved edits
            </>
          ) : (
            'Configuration'
          )}
        </p>
      </div>
      <div className="flex min-h-0 flex-1">
        {itemCount > 0 ? (
          <div className="w-70 shrink-0 overflow-auto border-border! border-r p-2">
            {settingsChanges.length > 0 ? (
              <>
                <GroupLabel>Settings</GroupLabel>
                <ul className="flex flex-col">
                  {settingsChanges.map((change) => (
                    <ChangeRow
                      actionLabel={onEditSettings ? `Edit ${change.label.toLowerCase()}` : undefined}
                      detail={`${change.from} → ${change.to}`}
                      key={change.key}
                      kind="changed"
                      onSelect={onEditSettings}
                      title={change.label}
                    />
                  ))}
                </ul>
              </>
            ) : null}
            {changes.length > 0 ? (
              <>
                <GroupLabel>Components</GroupLabel>
                <ul className="flex flex-col">
                  {changes.map((change) => {
                    const description = [change.section, change.label].filter(Boolean).join(' · ') || change.id;
                    return (
                      <ChangeRow
                        actionLabel={onSelectComponent ? `Show ${description} in the YAML` : undefined}
                        key={`${change.kind}-${change.id}`}
                        kind={change.kind}
                        onSelect={onSelectComponent ? () => onSelectComponent(change.id) : undefined}
                        title={description}
                      />
                    );
                  })}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
        {/* Out of flow so Monaco can't feed its width up the layout and latch the page wide. */}
        <div className="relative min-w-0 flex-1">
          <div className="absolute inset-0">
            {configChanged ? (
              <DiffEditor
                beforeMount={defineDiffTheme}
                language="yaml"
                loading={DIFF_LOADING}
                modified={editedYaml}
                options={DIFF_OPTIONS}
                original={savedYaml}
                theme={DIFF_THEME}
              />
            ) : (
              // A settings-only change would otherwise show an empty diff, which reads as a broken pane.
              <p className="flex h-full items-center justify-center p-8 text-center text-body-sm text-muted-foreground">
                The configuration itself is unchanged.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
