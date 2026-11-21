/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { InputEndBehavior } from './input-end-behavior';
import type { NodeMetaEntry } from './pipeline-flow-meta';
import type { EditTarget } from './yaml-edit-target';
import type { ResourceKind } from './yaml-resources';
import type { StopCondition } from './yaml-values';

type FlowNodeKind = 'section' | 'group' | 'leaf';

export type PipelineFlowNode = {
  id: string;
  kind: FlowNodeKind;
  label: string;
  labelText?: string;
  topics?: string[];
  section?: 'input' | 'processor' | 'output' | 'resource';
  parentId?: string;
  collapsible?: boolean;
  missingTopic?: boolean;
  missingSasl?: boolean;
  // How this node is edited/deleted; nested components carry path-based targets.
  editTarget?: EditTarget;
  // Key config values surfaced on the canvas card.
  meta?: NodeMetaEntry[];
  // Group child data flow: `sequential` chains them (sub-pipeline, e.g. branch/catch);
  // `parallel` fans out (alternatives, e.g. switch cases, broker inputs). Default sequential.
  childFlow?: 'sequential' | 'parallel';
  // Routing condition selecting this branch (switch `check`, fallback "on failure"),
  // shown as a label on the fan-out edge entering this node.
  condition?: string;
  // Catch-all / else branch (a switch case with no `check`).
  isDefault?: boolean;
  // Error / dead-letter path (catch handler, `errored()` route, fallback).
  isErrorPath?: boolean;
  // A `branch` processor: request_map copy-out / result_map merge-back. Rendered inline as a marker.
  branch?: { request: boolean; result: boolean };
  // Label of a resource this component references (cache/rate_limit `resource`).
  resourceRef?: string;
  // Kind of a candidate-promoted `resourceRef` (from its field name), so resolution stays
  // kind-aware — a `checkpoint_cache` ref never links to a same-labelled rate_limit.
  resourceRefKind?: ResourceKind;
  // Name-referencing field values that MIGHT be resource labels (`cache:`, `checkpoint_cache:`, …).
  // The post-pass promotes whichever matches a real resource label to `resourceRef`.
  resourceRefCandidates?: ResourceRefCandidate[];
  // A `switch` case wrapper — structural sub-node (not editable); selecting it picks the parent.
  isCase?: boolean;
  // Edit target for the case's routing condition (`{ check, … }`), forwarded to the case's entry card.
  caseEditTarget?: EditTarget;
  // Id of the (non-rendered) case-wrapper node a processor-switch case entry stands in for, so a
  // condition edit (which changes the wrapper's config) marks THIS entry card as unsaved.
  caseOwnerId?: string;
  // Container accepting new children (array YAML path + kind it holds); drives the in-container "+".
  insertSlot?: { containerPath: (string | number)[]; accepts: 'input' | 'processor' | 'output' };
  // For a `switch`: path of its `cases`/value array + section, so we can append a fresh case.
  addChildSlot?: { containerPath: (string | number)[]; section: 'processor' | 'output' };
  // A `resource:` ref whose label has no matching `*_resources` entry (dangling); drives an error badge + quick-fix.
  danglingRef?: boolean;
  // For a resource node: how many components reference its label (for "Used by N").
  usedByCount?: number;
  // For an array-resource node: the `*_resources` key it was defined under, so references
  // resolve kind-aware (a cache ref never links to a same-labelled rate_limit).
  resourceKey?: string;
  // An input's stop-condition slot: the YAML path of the object holding the input, where a
  // `read_until` wraps it, plus the condition already set there.
  stopSlot?: StopSlot;
  // How the input ends — a stop condition, once its data runs out, or never (inputs only).
  endBehavior?: InputEndBehavior;
};

export type StopSlot = {
  path: (string | number)[];
  condition?: StopCondition;
  /** How the input ends without the stop condition. */
  ownEnd: InputEndBehavior;
  /** Why the condition can only be read here, not edited: a `read_until` with no input yet. */
  locked?: string;
  /** Why its `read_until` can only be removed in the YAML, though its settings can change here. */
  unwrapLock?: string;
};

/** Whether a node (or a canvas card's data) is an input that takes a stop condition: it has a slot and a known end. */
export function hasStopSlot<T extends { section?: string; stopSlot?: StopSlot; endBehavior?: InputEndBehavior }>(
  node: T
): node is T & { stopSlot: StopSlot; endBehavior: InputEndBehavior } {
  return node.section === 'input' && node.stopSlot !== undefined && node.endBehavior !== undefined;
}

export type InputEndRow = {
  id: string;
  name: string;
  labelText?: string;
  /** Broker/sequence members are indented under their group. */
  nested: boolean;
  slot: StopSlot;
  effective: InputEndBehavior;
};

/** The pipeline's inputs that can take a stop condition, in canvas order. */
export function inputEndRows(nodes: PipelineFlowNode[]): InputEndRow[] {
  const rows: InputEndRow[] = [];
  for (const node of nodes) {
    if (hasStopSlot(node)) {
      rows.push({
        id: node.id,
        name: node.label,
        labelText: node.labelText,
        nested: node.parentId !== 'section-input',
        slot: node.stopSlot,
        effective: node.endBehavior,
      });
    }
  }
  return rows;
}

/** The lock on a `read_until` with no input yet. */
export const CHILDLESS_WRAPPER = 'Its `read_until` has no input to read from yet. Add one in the YAML first.';

// Human label for a node's section (canvas card kind chips, command-palette rows).
export const SECTION_LABEL: Record<NonNullable<PipelineFlowNode['section']>, string> = {
  input: 'Input',
  processor: 'Processor',
  output: 'Output',
  resource: 'Resource',
};

// SECTION_LABEL lookup tolerant of untyped values — card data carries `section` as a bare string.
export function sectionLabel(section?: string): string {
  return section === 'input' || section === 'processor' || section === 'output' || section === 'resource'
    ? SECTION_LABEL[section]
    : '';
}

// A possible resource reference held in a name-referencing field, with the kind that name implies.
export type ResourceRefCandidate = { label: string; kind: ResourceKind };
