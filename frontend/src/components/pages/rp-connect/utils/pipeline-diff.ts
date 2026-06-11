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

import { parseDocument } from 'yaml';

import { parsePipelineFlowTree } from './pipeline-flow-parser';
import { editTargetPath } from './yaml';

// A signature of each editable node's config, keyed by node id, so two YAML
// revisions can be compared node-by-node.
function nodeConfigSignatures(yaml: string): Map<string, string> {
  const signatures = new Map<string, string>();
  if (!yaml) {
    return signatures;
  }
  try {
    const doc = parseDocument(yaml);
    const { nodes } = parsePipelineFlowTree(yaml);
    for (const node of nodes) {
      if (!node.editTarget) {
        continue;
      }
      const value = doc.getIn(editTargetPath(node.editTarget)) as { toJSON?: () => unknown } | undefined;
      signatures.set(node.id, JSON.stringify(value?.toJSON?.() ?? value ?? null));
    }
  } catch {
    // Malformed YAML — nothing to compare.
  }
  return signatures;
}

/**
 * Ids of nodes that were added or whose config changed going from `prevYaml` to
 * `nextYaml`. Used to briefly highlight the node(s) an undo/redo affected.
 */
export function changedNodeIds(prevYaml: string, nextYaml: string): string[] {
  const prev = nodeConfigSignatures(prevYaml);
  const next = nodeConfigSignatures(nextYaml);
  const changed: string[] = [];
  for (const [id, signature] of next) {
    if (prev.get(id) !== signature) {
      changed.push(id);
    }
  }
  return changed;
}
