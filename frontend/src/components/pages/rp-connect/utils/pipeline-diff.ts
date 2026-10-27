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

import type { Document } from 'yaml';

import { parseEditableNodes } from './pipeline-flow-parser';
import { type EditTarget, editTargetPath } from './yaml';

export type NodeSignatures = {
  // Signature of each editable node's config, keyed by node id, for node-by-node comparison.
  signatures: Map<string, string>;
  // Every node's parent id (id -> parentId), used to attribute a change to the deepest node.
  parentOf: Map<string, string | undefined>;
};

// The JSON of the config an edit target addresses, so equal configs sign equally.
function editTargetSignature(doc: Document, target: EditTarget): string {
  const value = doc.getIn(editTargetPath(target)) as { toJSON?: () => unknown } | undefined;
  return JSON.stringify(value?.toJSON?.() ?? value ?? null);
}

function collectNodeSignatures(yaml: string, out: NodeSignatures): void {
  const { doc, nodes } = parseEditableNodes(yaml);
  for (const node of nodes) {
    out.parentOf.set(node.id, node.parentId);
    if (node.editTarget) {
      out.signatures.set(node.id, editTargetSignature(doc, node.editTarget));
    }
  }
}

// Exported so callers diffing many documents against one baseline can sign the baseline once.
export function nodeConfigSignatures(yaml: string): NodeSignatures {
  const result: NodeSignatures = { signatures: new Map(), parentOf: new Map() };
  if (!yaml) {
    return result;
  }
  try {
    collectNodeSignatures(yaml, result);
  } catch {
    // Malformed YAML — nothing to compare.
  }
  return result;
}

// Occurrence count of each signature, consumed by `takeSignature` as matches are found.
function signatureMultiset(signatures: Iterable<string>): Map<string, number> {
  const available = new Map<string, number>();
  for (const signature of signatures) {
    available.set(signature, (available.get(signature) ?? 0) + 1);
  }
  return available;
}

// Consumes one occurrence of `signature`, reporting whether one was left.
function takeSignature(available: Map<string, number>, signature: string): boolean {
  const left = available.get(signature) ?? 0;
  if (left <= 0) {
    return false;
  }
  available.set(signature, left - 1);
  return true;
}

// Consumes the counterpart of every same-id, same-signature node; returns the ids left to match.
function consumeUnmovedSignatures(
  prev: Map<string, string>,
  next: Map<string, string>,
  available: Map<string, number>
): string[] {
  const moved: string[] = [];
  for (const [id, signature] of next) {
    if (prev.get(id) === signature) {
      takeSignature(available, signature);
    } else {
      moved.push(id);
    }
  }
  return moved;
}

// Node ids in `next` whose signature has no counterpart left in `prev`'s multiset. Ids are positional
// (`proc-0`, …), so a moved-but-identical config is not a change; same-id matches consume their
// counterpart first so an unmoved duplicate never starves its twin. Known ambiguity (accepted):
// "edited A into a copy of just-deleted B" reads as "deleted A" — markers err toward under-flagging,
// and yaml !== initialYaml remains the authoritative dirty signal.
function unmatchedNextIds(prev: Map<string, string>, next: Map<string, string>): Set<string> {
  const available = signatureMultiset(prev.values());
  const moved = consumeUnmovedSignatures(prev, next, available);
  const changed = new Set<string>();
  for (const id of moved) {
    const signature = next.get(id);
    if (signature !== undefined && !takeSignature(available, signature)) {
      changed.add(id);
    }
  }
  return changed;
}

// Ids of nodes added or changed relative to a pre-computed baseline (unsaved markers): the panel
// re-diffs on every keystroke against a constant baseline, so the baseline is signed only once.
// A container's signature embeds its children, so attribute each change to the deepest node(s) only.
export function changedNodeIdsFromBaseline(baseline: NodeSignatures, nextYaml: string): string[] {
  const next = nodeConfigSignatures(nextYaml);
  const changed = unmatchedNextIds(baseline.signatures, next.signatures);
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

// Ids of nodes added or changed between the two YAMLs (undo/redo highlights, one-shot diffs).
export function changedNodeIds(prevYaml: string, nextYaml: string): string[] {
  return changedNodeIdsFromBaseline(nodeConfigSignatures(prevYaml), nextYaml);
}
