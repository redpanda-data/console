// Copyright 2026 Redpanda Data, Inc.

import { type Document, isMap, isNode, isSeq, parseDocument } from 'yaml';

import { type EditTarget, editTargetPath, type ResourceArrayKey, targetComponentType } from './yaml-edit-target';
import { asRecord, unwrapReadUntil, YAML_STRINGIFY_OPTIONS } from './yaml-values';

// Append into the seq at `path` IN PLACE, creating it when absent — rebuilding an existing
// array through toJSON()/setIn would strip comments and anchors off its current entries.
export const appendToSeq = (doc: Document.Parsed, path: string[], item: unknown): void => {
  const node = doc.getIn(path);
  if (isSeq(node)) {
    node.add(doc.createNode(item));
  } else {
    doc.setIn(path, [item]);
  }
};

// Blank = empty/whitespace text or an empty root map — `{}` is what the yaml lib emits when the
// last key is deleted. Comment-only text is NOT blank here: it merges, preserving the comments.
export const isBlankConfigText = (text: string): boolean => {
  const trimmed = text.trim();
  return trimmed === '' || trimmed === '{}';
};

function isEmptySeq(node: unknown): boolean {
  return isSeq(node) && node.items.length === 0;
}

function isEmptyMap(node: unknown): boolean {
  return isMap(node) && node.items.length === 0;
}

// After a delete, drop now-empty TOP-LEVEL containers so the diagram falls back to its placeholder.
// Nested arrays deliberately stay `[]` — deleting the key can hide surviving content or leave `- {}` cruft.
function pruneEmptyContainers(doc: Document.Parsed, target: EditTarget): void {
  if (target.kind === 'processor') {
    if (isEmptySeq(doc.getIn(['pipeline', 'processors']))) {
      doc.deleteIn(['pipeline', 'processors']);
    }
    if (isEmptyMap(doc.get('pipeline'))) {
      doc.delete('pipeline');
    }
  } else if (target.kind === 'resource' && isEmptySeq(doc.getIn([target.resourceKey]))) {
    doc.delete(target.resourceKey);
  } else if (
    target.kind === 'path' &&
    typeof target.path[0] === 'string' &&
    target.path[0].endsWith('_resources') &&
    typeof target.path[1] === 'number' &&
    isEmptySeq(doc.get(target.path[0]))
  ) {
    // *_resources items are path targets, but their array is still a top-level container — drop when emptied.
    doc.delete(target.path[0]);
  }
}

const recordAt = (doc: Document, path: (string | number)[]): Record<string, unknown> | undefined => {
  const node = doc.getIn(path);
  return isNode(node) ? asRecord(node.toJSON()) : undefined;
};

/**
 * The YAML path of the component an edit target holds. The canvas shows an input under `input` (the
 * top-level one, or a broker or sequence member) as the input its `read_until` wraps, so that is where
 * its component is read and written; deleting the target still takes the whole slot.
 */
export function targetComponentPath(doc: Document, target: EditTarget): (string | number)[] {
  const path = editTargetPath(target);
  if (targetComponentType(target) !== 'input' || path[0] !== 'input') {
    return path;
  }
  const slot = recordAt(doc, path);
  return slot ? [...path, ...unwrapReadUntil(slot).innerPath] : path;
}

/** Read the component object at an edit target as plain JS (for the edit dialog). */
export function getComponentAt(yaml: string, target: EditTarget): Record<string, unknown> | undefined {
  try {
    const doc = parseDocument(yaml);
    return recordAt(doc, targetComponentPath(doc, target));
  } catch {
    // Unparseable YAML: no component at the target.
  }
}

export function setComponentAt(
  yaml: string,
  target: EditTarget,
  componentObject: Record<string, unknown>
): string | null {
  try {
    const doc = parseDocument(yaml);
    const path = targetComponentPath(doc, target);
    // Only overwrite an existing node: writing to a stale path (external edit / undo) would make
    // setIn pad a sequence with `- null` or inject a phantom component under a padded parent.
    if (doc.getIn(path) === undefined) {
      return null;
    }
    doc.setIn(path, componentObject);
    return doc.toString(YAML_STRINGIFY_OPTIONS);
  } catch {
    return null;
  }
}

/** Remove the component at an edit target, pruning containers left empty. */
export function removeComponentAt(yaml: string, target: EditTarget): string | null {
  try {
    const doc = parseDocument(yaml);
    doc.deleteIn(editTargetPath(target));
    pruneEmptyContainers(doc, target);
    const out = doc.toString(YAML_STRINGIFY_OPTIONS);
    // Deleting the last component leaves `{}` — normalize to a truly blank config so the
    // editor and canvas fall back to their empty states.
    return isBlankConfigText(out) ? '' : out;
  } catch {
    return null;
  }
}

// Items in the sequence at `path` (0 if absent). Locates a just-inserted item (an append lands at length-1).
export function seqLengthAt(yaml: string, path: (string | number)[]): number {
  try {
    const seq = parseDocument(yaml).getIn(path);
    return isSeq(seq) ? seq.items.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Insert a component into any array at `index` (creating the array as needed). `containerPath` is
 * the target array's YAML path, e.g. `['pipeline','processors']` or `['input','broker','inputs']`.
 */
export function insertComponentAt(
  yaml: string,
  containerPath: (string | number)[],
  index: number,
  componentObject: Record<string, unknown>
): string | null {
  try {
    const doc = parseDocument(yaml);
    const seq = doc.getIn(containerPath);
    if (isSeq(seq)) {
      const clamped = Math.max(0, Math.min(index, seq.items.length));
      seq.items.splice(clamped, 0, doc.createNode(componentObject));
    } else if (seq === undefined || seq === null) {
      doc.setIn(containerPath, [componentObject]);
    } else {
      // The container exists but isn't a sequence (malformed YAML) — refuse rather than clobber it.
      return null;
    }
    return doc.toString(YAML_STRINGIFY_OPTIONS);
  } catch {
    return null;
  }
}

/** Append a resource object to a resource array (creating the array as needed). */
export function appendResource(
  yaml: string,
  resourceKey: ResourceArrayKey,
  resourceObject: Record<string, unknown>
): string | null {
  try {
    const doc = parseDocument(yaml);
    appendToSeq(doc, [resourceKey], resourceObject);
    return doc.toString(YAML_STRINGIFY_OPTIONS);
  } catch {
    return null;
  }
}
