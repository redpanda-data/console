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

import { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import { type PipelineFlowNode, parsePipelineFlowTree, sectionLabel } from '../utils/pipeline-flow-parser';

/**
 * What changed, in the pipeline's own vocabulary. The line diff beside this says what moved; this says
 * which components moved, which is what decides whether a change is safe to apply to something running.
 */

export type ChangeKind = 'added' | 'removed' | 'changed';

export type ComponentChange = {
  /** Node id from the flow parser (`input-0`, `proc-1`, …). Positional, stable within a document. */
  id: string;
  kind: ChangeKind;
  /** "Input", "Processor", … or empty for a node the parser couldn't place. */
  section: string;
  /** The component as the editor shows it, e.g. `kafka_franz`. */
  label: string;
};

/**
 * Section containers are left out: they only hold children, so counting them would report "Input
 * changed" alongside the component that actually did.
 */
function componentNodesById(yaml: string): Map<string, PipelineFlowNode> {
  const byId = new Map<string, PipelineFlowNode>();
  if (!yaml.trim()) {
    return byId;
  }
  try {
    for (const node of parsePipelineFlowTree(yaml).nodes) {
      if (node.kind !== 'section') {
        byId.set(node.id, node);
      }
    }
  } catch {
    // Malformed YAML — the line diff still works, the summary just has nothing to say.
  }
  return byId;
}

const describe = (id: string, node: PipelineFlowNode | undefined, kind: ChangeKind): ComponentChange => ({
  id,
  kind,
  section: sectionLabel(node?.section),
  label: node?.labelText ?? node?.label ?? '',
});

/**
 * Ids are positional, so this compares by id. `changedNodeIds` already handles the subtle case (a
 * moved-but-identical component is not a change), so it decides "changed"; this only classifies it.
 */
export function summarizeComponentChanges(
  savedYaml: string,
  editedYaml: string,
  changedIds: string[]
): ComponentChange[] {
  const saved = componentNodesById(savedYaml);
  const edited = componentNodesById(editedYaml);
  const changes: ComponentChange[] = [];

  for (const id of edited.keys()) {
    if (!saved.has(id)) {
      changes.push(describe(id, edited.get(id), 'added'));
    }
  }
  for (const id of saved.keys()) {
    if (!edited.has(id)) {
      changes.push(describe(id, saved.get(id), 'removed'));
    }
  }
  for (const id of changedIds) {
    // Only an edit in place; an id missing from either side is already counted above.
    if (saved.has(id) && edited.has(id)) {
      changes.push(describe(id, edited.get(id), 'changed'));
    }
  }

  // Grouped by section so the list reads in pipeline order rather than parse order.
  return changes.sort((a, b) => a.section.localeCompare(b.section) || a.id.localeCompare(b.id));
}

/**
 * The lane's name, in one place: it also names the state the header pill and the leave dialog talk
 * about, and the three drifting apart is what made "Changes" read as a revision history.
 */
export const UNSAVED_CHANGES_LANE_LABEL = 'Unsaved changes';

/**
 * On the header pill. Says where the edits are while they are unsaved, because otherwise the recovery
 * buffer is invisible until it surprises someone as an offer on a later visit — and something nobody
 * knows about is something nobody can rely on.
 */
export const UNSAVED_CHANGES_PILL_TOOLTIP = 'Unsaved changes — kept in this browser until you save or discard them';

/**
 * A save writes the settings as well as the configuration, so an edit to either is an unsaved change.
 * Leaving the settings out made the lane contradict the header, which counts both.
 */
export type SettingsFieldKey = 'name' | 'description' | 'computeUnits' | 'tags';

/** Ordered as the settings dialog presents them. */
const SETTINGS_FIELDS: { key: SettingsFieldKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'description', label: 'Description' },
  { key: 'computeUnits', label: 'Compute units' },
  { key: 'tags', label: 'Tags' },
];

/** Structural shape of the editor's settings form, so this module stays free of the page's imports. */
export type SettingsValues = {
  name?: string;
  description?: string;
  computeUnits?: number;
  /** Sparse on purpose: the form's default values type a removed row as `undefined`. */
  tags?: ({ key?: string; value?: string } | undefined)[];
};

export type SettingsChange = {
  key: SettingsFieldKey;
  label: string;
  /** Both sides formatted for display. */
  from: string;
  to: string;
};

const NOT_SET = 'not set';

// Untrimmed on purpose: trailing whitespace in a name is a real change, and hiding it here would show
// a row that says nothing changed.
function formatSettingValue(key: SettingsFieldKey, values: SettingsValues): string {
  if (key === 'computeUnits') {
    return values.computeUnits === undefined ? NOT_SET : String(values.computeUnits);
  }
  if (key === 'tags') {
    const tags = (values.tags ?? []).filter((tag) => tag?.key);
    return tags.length > 0
      ? tags.map((tag) => (tag?.value ? `${tag.key}: ${tag.value}` : tag?.key)).join(', ')
      : 'none';
  }
  return values[key] || NOT_SET;
}

/**
 * `saved` is the form's default values, which the editor re-baselines on every successful save — so this
 * is a diff against what the pipeline holds, not against what it held when the page opened.
 *
 * Compared by value rather than by react-hook-form's `dirtyFields`, which is a record of what has been
 * touched: a restored recovery buffer resets the form with `keepDirty`, leaving fields that differ from
 * what is saved with no dirty flag to find them by.
 */
export function summarizeSettingsChanges(saved: SettingsValues | undefined, current: SettingsValues): SettingsChange[] {
  const changes: SettingsChange[] = [];
  for (const { key, label } of SETTINGS_FIELDS) {
    const from = formatSettingValue(key, saved ?? {});
    const to = formatSettingValue(key, current);
    if (from !== to) {
      changes.push({ key, label, from, to });
    }
  }
  return changes;
}

/** What applying will do. A running pipeline has no apply-later, so saving restarts it. */
export function changesImpactMessage(state: Pipeline_State | undefined): string {
  if (state === Pipeline_State.DRAFT) {
    return "These changes aren't saved to the draft yet.";
  }
  if (state === Pipeline_State.RUNNING || state === Pipeline_State.STARTING) {
    return 'These changes are not live. Applying them restarts the pipeline, which drops in-flight messages.';
  }
  return 'These changes are not saved to the pipeline yet.';
}

/**
 * Only a live pipeline earns a warning. The rest is a statement of fact, and colouring it the same
 * orange as the header's "N issues to fix" would flatten both into one wall of alarm.
 */
export const changesImpactTone = (state: Pipeline_State | undefined): 'info' | 'warning' =>
  state === Pipeline_State.RUNNING || state === Pipeline_State.STARTING ? 'warning' : 'info';

/** The lane is only offered where something is saved to compare against, so this needs no create case. */
export const NO_CHANGES_COPY = {
  title: 'No unsaved changes',
  body: 'The editor and settings match what is saved.',
} as const;
