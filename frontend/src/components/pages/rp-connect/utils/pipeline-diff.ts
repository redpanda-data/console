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

type NodeSignatures = {
  // Signature of each editable node's config, keyed by node id, for node-by-node comparison.
  signatures: Map<string, string>;
  // Every node's parent id (id -> parentId), used to attribute a change to the deepest node.
  parentOf: Map<string, string | undefined>;
};

function nodeConfigSignatures(yaml: string): NodeSignatures {
  const signatures = new Map<string, string>();
  const parentOf = new Map<string, string | undefined>();
  if (!yaml) {
    return { signatures, parentOf };
  }
  try {
    const doc = parseDocument(yaml);
    const { nodes } = parsePipelineFlowTree(yaml);
    for (const node of nodes) {
      parentOf.set(node.id, node.parentId);
      if (!node.editTarget) {
        continue;
      }
      const value = doc.getIn(editTargetPath(node.editTarget)) as { toJSON?: () => unknown } | undefined;
      signatures.set(node.id, JSON.stringify(value?.toJSON?.() ?? value ?? null));
    }
  } catch {
    // Malformed YAML — nothing to compare.
  }
  return { signatures, parentOf };
}

// Ids of nodes added or changed from `prevYaml` to `nextYaml`. Used for unsaved-change markers and
// to briefly highlight the node(s) an undo/redo affected. A container's config embeds its children,
// so editing a nested node also changes every ancestor's signature; we attribute the change only to
// the deepest node(s) by dropping any changed node that is an ancestor of another changed node.
export function changedNodeIds(prevYaml: string, nextYaml: string): string[] {
  const prev = nodeConfigSignatures(prevYaml);
  const next = nodeConfigSignatures(nextYaml);
  const changed = new Set<string>();
  for (const [id, signature] of next.signatures) {
    if (prev.signatures.get(id) !== signature) {
      changed.add(id);
    }
  }
  const isAncestorOfChanged = (id: string): boolean => {
    for (const other of changed) {
      if (other === id) {
        continue;
      }
      for (let p = next.parentOf.get(other); p !== undefined; p = next.parentOf.get(p)) {
        if (p === id) {
          return true;
        }
      }
    }
    return false;
  };
  return [...changed].filter((id) => !isAncestorOfChanged(id));
}
