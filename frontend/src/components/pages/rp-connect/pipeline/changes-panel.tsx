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
import { Badge, type BadgeTone } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { cn } from 'components/redpanda-ui/lib/utils';
import { CheckCircle2 } from 'lucide-react';
import type { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import { type ChangeKind, type ComponentChange, changesImpactMessage } from './changes-summary';

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

const DIFF_OPTIONS = {
  readOnly: true,
  domReadOnly: true,
  renderSideBySide: true,
  // The interesting change is usually a handful of lines in a long document.
  hideUnchangedRegions: { enabled: true },
  renderOverviewRuler: false,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 12,
  lineNumbersMinChars: 3,
  glyphMargin: false,
  folding: false,
  scrollbar: { alwaysConsumeMouseWheel: false },
} as const;

const ComponentChangeRow = ({ change, onSelect }: { change: ComponentChange; onSelect?: (id: string) => void }) => {
  const description = [change.section, change.label].filter(Boolean).join(' · ') || change.id;
  return (
    <li>
      <Button
        className="h-auto w-full justify-start gap-2 px-2 py-1.5 text-left font-normal"
        onClick={onSelect ? () => onSelect(change.id) : undefined}
        variant="ghost"
      >
        <Badge className="shrink-0" tone={KIND_TONE[change.kind]} variant="subtle">
          {KIND_LABEL[change.kind]}
        </Badge>
        <span className="min-w-0 truncate text-sm">{description}</span>
      </Button>
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
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center"
        data-testid="changes-panel-empty"
      >
        <CheckCircle2 className="size-5 text-success" />
        <p className="text-body">No unsaved changes</p>
        <p className="max-w-prose text-muted-foreground text-sm">
          {mode === 'create'
            ? 'Everything in the editor is saved to your draft.'
            : 'The editor matches the saved configuration.'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="changes-panel">
      <div className="shrink-0 border-border! border-b px-4 py-3">
        <p className="text-sm text-warning">{changesImpactMessage(pipelineState, mode)}</p>
      </div>
      <div className="flex min-h-0 flex-1">
        {changes.length > 0 ? (
          <div className="w-[280px] shrink-0 overflow-auto border-border! border-r p-2">
            <h5 className="px-2 pb-1 text-heading-xs text-muted-foreground">
              {changes.length === 1 ? '1 component' : `${changes.length} components`}
            </h5>
            <ul className="flex flex-col">
              {changes.map((change) => (
                <ComponentChangeRow change={change} key={`${change.kind}-${change.id}`} onSelect={onSelectComponent} />
              ))}
            </ul>
          </div>
        ) : null}
        {/* Out of flow so Monaco can't feed its width up the layout and latch the page wide. */}
        <div className={cn('relative min-w-0 flex-1')}>
          <div className="absolute inset-0">
            <DiffEditor
              language="yaml"
              loading={<div className="p-4 text-muted-foreground text-sm">Loading diff...</div>}
              modified={editedYaml}
              options={DIFF_OPTIONS}
              original={savedYaml}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
