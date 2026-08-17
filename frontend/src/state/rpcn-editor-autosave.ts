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

import { config } from 'config';
import { create } from 'zustand';

/**
 * Crash recovery for the Redpanda Connect pipeline editor.
 *
 * This is deliberately *not* the drafts feature. A draft is a decision the user made — it lives
 * server-side as a pipeline in `STATE_DRAFT`, is visible to their team, and appears in the pipeline
 * list. This store covers the gap a draft cannot: the seconds between typing something and saving it,
 * which a refresh, a crashed tab or a closed laptop would otherwise take with them.
 *
 * So it holds exactly one buffer per editor target (the create page, or a given pipeline), it is
 * offered back as "restore what you were typing", and it is dropped the moment a real save succeeds.
 * It is never a row in any list: an unsaved buffer the user didn't ask to keep is not an object they
 * should have to manage.
 */

export const EDITOR_AUTOSAVE_STORAGE_KEY = 'rpcn-editor-autosave';

/**
 * Storage key used by the earlier browser-local drafts prototype, removed on first read. Those drafts
 * are superseded by server-side drafts, and left alone the data would sit in localStorage forever with
 * nothing able to read it.
 */
const LEGACY_DRAFTS_STORAGE_KEY = 'rpcn-pipeline-drafts';

/** Buffers beyond this are evicted oldest-first, so editing many pipelines can't grow without bound. */
export const MAX_AUTOSAVE_BUFFERS = 10;

/**
 * Refused above this size. localStorage gives ~5 MB per origin for the whole app, and a pipeline
 * config that large is pathological — 256 KB is far past the biggest real config.
 */
export const MAX_AUTOSAVE_YAML_BYTES = 256 * 1024;

/** Editor target for a buffer: the create page, or one pipeline's editor. */
export const CREATE_AUTOSAVE_TARGET = 'create';

export const autosaveTargetKey = (pipelineId?: string): string => pipelineId || CREATE_AUTOSAVE_TARGET;

export type EditorAutosaveTag = { key: string; value: string };

export type EditorAutosaveEntry = {
  /** `create`, or the pipeline id whose editor this came from. */
  targetKey: string;
  /** Cluster the buffer was written against; buffers never cross clusters. */
  clusterId: string;
  name: string;
  description: string;
  computeUnits: number;
  tags: EditorAutosaveTag[];
  configYaml: string;
  /** Epoch ms of the last autosave. */
  updatedAt: number;
};

/** Everything a buffer carries except the fields the store stamps itself. */
export type EditorAutosaveInput = Omit<EditorAutosaveEntry, 'clusterId' | 'updatedAt'>;

const currentClusterId = (): string => config.clusterId || 'default';

export const isAutosaveYamlTooLarge = (configYaml: string): boolean =>
  new Blob([configYaml]).size > MAX_AUTOSAVE_YAML_BYTES;

function isAutosaveEntry(value: unknown): value is EditorAutosaveEntry {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const entry = value as Partial<EditorAutosaveEntry>;
  return (
    typeof entry.targetKey === 'string' &&
    typeof entry.clusterId === 'string' &&
    typeof entry.configYaml === 'string' &&
    typeof entry.updatedAt === 'number'
  );
}

/** Tolerant read: anything unparseable or shape-shifted (older format, hand-edited) is dropped. */
function readAll(): EditorAutosaveEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    window.localStorage.removeItem(LEGACY_DRAFTS_STORAGE_KEY);
    const raw = window.localStorage.getItem(EDITOR_AUTOSAVE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter(isAutosaveEntry) : [];
  } catch {
    return [];
  }
}

/** Reports whether the write landed. Autosave failing is not worth a toast, but it is worth knowing. */
function writeAll(entries: EditorAutosaveEntry[]): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    window.localStorage.setItem(EDITOR_AUTOSAVE_STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    // Storage blocked (private mode) or over quota.
    return false;
  }
}

/** Newest first, capped — an over-quota cluster loses its stalest buffers. */
function pruneForCluster(entries: EditorAutosaveEntry[], clusterId: string): EditorAutosaveEntry[] {
  const mine = entries.filter((e) => e.clusterId === clusterId).sort((a, b) => b.updatedAt - a.updatedAt);
  const others = entries.filter((e) => e.clusterId !== clusterId);
  return [...mine.slice(0, MAX_AUTOSAVE_BUFFERS), ...others];
}

type EditorAutosaveStore = {
  /** Every buffer in storage, across clusters. Use the selectors below to scope to the current one. */
  entries: EditorAutosaveEntry[];
  /** Insert or replace the buffer for a target and persist it. */
  save: (input: EditorAutosaveInput) => boolean;
  /** Drop a target's buffer — on a successful save, or when the user declines to restore it. */
  clear: (targetKey: string) => void;
  /** Re-read from storage — for another tab's writes, and to reset between tests. */
  refresh: () => void;
};

export const useRpcnEditorAutosaveStore = create<EditorAutosaveStore>()((set) => ({
  entries: readAll(),

  save: (input) => {
    if (isAutosaveYamlTooLarge(input.configYaml)) {
      return false;
    }
    const entry: EditorAutosaveEntry = {
      ...input,
      clusterId: currentClusterId(),
      updatedAt: Date.now(),
    };
    // Read through storage rather than trusting in-memory state, so a buffer written by another tab
    // isn't clobbered by this one's stale snapshot.
    const next = pruneForCluster(
      [...readAll().filter((e) => !(e.targetKey === entry.targetKey && e.clusterId === entry.clusterId)), entry],
      entry.clusterId
    );
    if (!writeAll(next)) {
      return false;
    }
    set({ entries: next });
    return true;
  },

  clear: (targetKey) => {
    const clusterId = currentClusterId();
    const next = readAll().filter((e) => !(e.targetKey === targetKey && e.clusterId === clusterId));
    writeAll(next);
    set({ entries: next });
  },

  refresh: () => set({ entries: readAll() }),
}));

export function selectAutosaveEntry(
  entries: EditorAutosaveEntry[],
  targetKey: string | undefined
): EditorAutosaveEntry | null {
  if (!targetKey) {
    return null;
  }
  const clusterId = currentClusterId();
  return entries.find((e) => e.targetKey === targetKey && e.clusterId === clusterId) ?? null;
}

/** Imperative API for callbacks and non-hook contexts. */
export const rpcnEditorAutosave = {
  save: (input: EditorAutosaveInput) => useRpcnEditorAutosaveStore.getState().save(input),
  clear: (targetKey: string) => useRpcnEditorAutosaveStore.getState().clear(targetKey),
  get: (targetKey: string) => selectAutosaveEntry(useRpcnEditorAutosaveStore.getState().entries, targetKey),
};
