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

import { parseEditableNodes } from './pipeline-flow-parser';
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
    const { doc, nodes } = parseEditableNodes(yaml);
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

// Node ids in `next` whose signature has no counterpart left in `prev`'s multiset. Ids are positional
// (`proc-0`, …), so a moved-but-identical config is not a change; same-id matches consume their
// counterpart first so an unmoved duplicate never starves its twin. Known ambiguity (accepted):
// "edited A into a copy of just-deleted B" reads as "deleted A" — markers err toward under-flagging,
// and yaml !== initialYaml remains the authoritative dirty signal.
function unmatchedNextIds(prev: Map<string, string>, next: Map<string, string>): Set<string> {
  const available = new Map<string, number>();
  for (const signature of prev.values()) {
    available.set(signature, (available.get(signature) ?? 0) + 1);
  }
  const take = (signature: string): boolean => {
    const left = available.get(signature) ?? 0;
    if (left <= 0) {
      return false;
    }
    available.set(signature, left - 1);
    return true;
  };
  const moved: string[] = [];
  const changed = new Set<string>();
  for (const [id, signature] of next) {
    if (prev.get(id) === signature) {
      take(signature);
    } else {
      moved.push(id);
    }
  }
  for (const id of moved) {
    const signature = next.get(id);
    if (signature !== undefined && !take(signature)) {
      changed.add(id);
    }
  }
  return changed;
}

// Ids of nodes added or changed between the two YAMLs (unsaved markers, undo/redo highlights).
// A container's signature embeds its children, so attribute each change to the deepest node(s) only.
export function changedNodeIds(prevYaml: string, nextYaml: string): string[] {
  const prev = nodeConfigSignatures(prevYaml);
  const next = nodeConfigSignatures(nextYaml);
  const changed = unmatchedNextIds(prev.signatures, next.signatures);
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
