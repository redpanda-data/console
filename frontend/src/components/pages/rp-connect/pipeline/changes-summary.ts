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
 * What changed between the saved configuration and the editor, in the pipeline's own vocabulary.
 *
 * The line diff beside this says exactly *what* moved; this says *which components* moved, which is
 * what tells you whether a change is safe to apply to something that is running.
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
 * Component nodes of a document, keyed by id.
 *
 * Section containers (the `input:`/`output:` headings) are left out: they exist in the tree to hold
 * children, so counting them would report "Input changed" alongside the component that actually did.
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
 * Component-level changes between two documents.
 *
 * Ids are positional, so this compares by id: an id only in the editor is added, only in the saved
 * config is removed. `changedNodeIds` already handles the subtle case (a moved-but-identical
 * component is not a change), so it decides "changed" — this only classifies what it reports.
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
 * What applying the pending edits will do, said plainly. A running pipeline is the case worth warning
 * about: there is no apply-later, so saving restarts it and drops whatever is in flight.
 */
export function changesImpactMessage(state: Pipeline_State | undefined, mode: 'create' | 'edit'): string {
  if (mode === 'create') {
    return 'Nothing is deployed yet, so this is what you have added since the last save.';
  }
  if (state === Pipeline_State.DRAFT) {
    return "These changes aren't saved to the draft yet.";
  }
  if (state === Pipeline_State.RUNNING || state === Pipeline_State.STARTING) {
    return 'These changes are not live. Applying them restarts the pipeline, which drops in-flight messages.';
  }
  return 'These changes are not saved to the pipeline yet.';
}
