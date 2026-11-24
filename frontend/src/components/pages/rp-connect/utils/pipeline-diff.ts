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
import { editTargetPath } from './yaml';

export type NodeSignatures = {
  signatures: Map<string, string>;
  parentOf: Map<string, string | undefined>;
};

function configSignature(doc: Document, path: ReturnType<typeof editTargetPath>) {
  const value = doc.getIn(path) as { toJSON?: () => unknown } | undefined;
  return JSON.stringify(value?.toJSON?.() ?? value ?? null);
}

function collectNodeSignatures(yaml: string, out: NodeSignatures) {
  const { doc, nodes } = parseEditableNodes(yaml);
  for (const node of nodes) {
    out.parentOf.set(node.id, node.parentId);
    if (node.editTarget) {
      out.signatures.set(node.id, configSignature(doc, editTargetPath(node.editTarget)));
    }
  }
}

export function nodeConfigSignatures(yaml: string) {
  const result: NodeSignatures = { signatures: new Map(), parentOf: new Map() };
  if (!yaml) {
    return result;
  }
  try {
    collectNodeSignatures(yaml, result);
  } catch {}
  return result;
}

function signatureMultiset(signatures: Iterable<string>) {
  const available = new Map<string, number>();
  for (const signature of signatures) {
    available.set(signature, (available.get(signature) ?? 0) + 1);
  }
  return available;
}

function takeSignature(available: Map<string, number>, signature: string) {
  const left = available.get(signature) ?? 0;
  if (left <= 0) {
    return false;
  }
  available.set(signature, left - 1);
  return true;
}

function consumeUnmovedSignatures(
  prev: Map<string, string>,
  next: Map<string, string>,
  available: Map<string, number>
) {
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

function unmatchedNextIds(prev: Map<string, string>, next: Map<string, string>) {
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

/**
 * re-diffs on every keystroke against a constant baseline, so the baseline is signed only once.
 * A container's signature embeds its children, so attribute each change to the deepest node(s) only.
 * Consumes same-id matches first, then matches by signature, so reordering unchanged nodes is not an edit.
 * These markers summarize changes; compare the YAML itself to determine whether the document is dirty.
 */
export function changedNodeIdsFromBaseline(baseline: NodeSignatures, nextYaml: string) {
  const next = nodeConfigSignatures(nextYaml);
  const changed = unmatchedNextIds(baseline.signatures, next.signatures);
  const isAncestorOfChanged = (id: string) => {
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

export function changedNodeIds(prevYaml: string, nextYaml: string) {
  return changedNodeIdsFromBaseline(nodeConfigSignatures(prevYaml), nextYaml);
}
