'use client';

import { useState } from 'react';
import { type JSONObject, type JSONValue, updateValueAtPath } from './json-value';

export interface JSONDocumentChange {
  document: JSONValue;
}

// Comparison acknowledges one complete pending transaction; it never assigns identities to individual values.
const MAX_DOCUMENT_COMPARISON_NODES = 100_000;

type JSONDocumentPair = [JSONValue, JSONValue];

function queueArrayChildren(left: JSONValue[], right: JSONValue[], pending: JSONDocumentPair[], remaining: number) {
  if (left.length !== right.length || left.length + pending.length > remaining) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (Object.hasOwn(left, index) !== Object.hasOwn(right, index)) {
      return false;
    }
    pending.push([left[index], right[index]]);
  }
  return true;
}

function queueObjectChildren(left: JSONObject, right: JSONObject, pending: JSONDocumentPair[], remaining: number) {
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length || keys.length + pending.length > remaining) {
    return false;
  }
  for (const key of keys) {
    if (!Object.hasOwn(right, key)) {
      return false;
    }
    pending.push([left[key], right[key]]);
  }
  return true;
}

function queueJSONChildren(left: JSONValue, right: JSONValue, pending: JSONDocumentPair[], remaining: number) {
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && queueArrayChildren(left, right, pending, remaining);
  }
  return queueObjectChildren(left, right, pending, remaining);
}

function sameJSONDocument(left: JSONValue, right: JSONValue): boolean {
  const pending: JSONDocumentPair[] = [[left, right]];
  let remaining = MAX_DOCUMENT_COMPARISON_NODES;
  while (pending.length > 0) {
    if (remaining === 0) {
      return false;
    }
    remaining -= 1;
    const pair = pending.pop();
    if (pair === undefined) {
      return false;
    }
    const [currentLeft, currentRight] = pair;
    if (Object.is(currentLeft, currentRight)) {
      continue;
    }
    if (!queueJSONChildren(currentLeft, currentRight, pending, remaining)) {
      return false;
    }
  }
  return true;
}

interface DocumentIdentity {
  document: JSONValue;
  epoch: number;
  proposal: JSONDocumentChange | undefined;
}

/** A whole pending-document echo acknowledges an edit, including form libraries that clone JSON values. */
export function useJSONDocumentIdentity(
  document: JSONValue,
  onChange: (value: JSONValue) => void,
  onError: (error: string | undefined) => void
) {
  const [identity, setIdentity] = useState<DocumentIdentity>({ document, epoch: 0, proposal: undefined });
  if (identity.document !== document) {
    setIdentity({
      document,
      epoch:
        identity.proposal !== undefined && sameJSONDocument(identity.proposal.document, document)
          ? identity.epoch
          : identity.epoch + 1,
      proposal: undefined,
    });
  }
  const proposeFieldChange = (path: string[], value: JSONValue): JSONDocumentChange | undefined => {
    let proposal: JSONDocumentChange | undefined;
    try {
      proposal = { document: path.length === 0 ? value : updateValueAtPath(document, path, value) };
      setIdentity((previous) => ({ ...previous, proposal }));
      onChange(proposal.document);
      onError(undefined);
      return proposal;
    } catch (error) {
      setIdentity((previous) => (previous.proposal === proposal ? { ...previous, proposal: undefined } : previous));
      onError(error instanceof Error ? error.message : 'Could not update the JSON value.');
      return undefined;
    }
  };
  return { epoch: identity.epoch, proposeFieldChange };
}

interface ArrayRows {
  ids: number[];
  nextId: number;
}

interface ArrayRowIdentity {
  proposal: { change: JSONDocumentChange; rows: ArrayRows } | undefined;
  rows: ArrayRows;
}

function initialArrayRows(length: number): ArrayRows {
  let nextId = 0;
  const ids = Array.from({ length }, () => {
    const id = nextId;
    nextId += 1;
    return id;
  });
  return { ids, nextId };
}

/** Row IDs never enter JSON data and are promoted only after the parent accepts the emitted document. */
export function useJSONArrayIdentity(length: number, document: JSONValue) {
  const [identity, setIdentity] = useState<ArrayRowIdentity>(() => ({
    rows: initialArrayRows(length),
    proposal: undefined,
  }));
  const rows =
    identity.proposal !== undefined && sameJSONDocument(identity.proposal.change.document, document)
      ? identity.proposal.rows
      : identity.rows;
  if (rows !== identity.rows) {
    setIdentity({ rows, proposal: undefined });
  }
  const proposeInsertion = (change: JSONDocumentChange) => {
    setIdentity({
      rows,
      proposal: { change, rows: { ids: [...rows.ids, rows.nextId], nextId: rows.nextId + 1 } },
    });
  };
  const proposeRemoval = (change: JSONDocumentChange, removedIndex: number) => {
    setIdentity({
      rows,
      proposal: { change, rows: { ids: rows.ids.filter((_, index) => index !== removedIndex), nextId: rows.nextId } },
    });
  };
  return { rowIds: rows.ids, proposeInsertion, proposeRemoval };
}
