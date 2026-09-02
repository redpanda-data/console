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

// Crash recovery for the pipeline editor: one localStorage buffer per editor target, cleared on save.
// Not the drafts feature, which is server-side `STATE_DRAFT`.

export const EDITOR_AUTOSAVE_STORAGE_KEY = 'rpcn-editor-autosave';

// Earlier browser-local drafts prototype; removed on first read.
const LEGACY_DRAFTS_STORAGE_KEY = 'rpcn-pipeline-drafts';

/** Per cluster, evicted oldest-first. */
export const MAX_AUTOSAVE_BUFFERS = 10;

export const MAX_AUTOSAVE_YAML_BYTES = 256 * 1024;

/** Expired buffers are dropped on read. Configs are stored verbatim, so a pasted credential must not outlive the week. */
export const MAX_AUTOSAVE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const CREATE_AUTOSAVE_TARGET = 'create';

export const autosaveTargetKey = (pipelineId?: string): string => pipelineId || CREATE_AUTOSAVE_TARGET;

export type EditorAutosaveTag = { key: string; value: string };

export type EditorAutosaveEntry = {
  /** `create`, or a pipeline id. */
  targetKey: string;
  clusterId: string;
  name: string;
  description: string;
  computeUnits: number;
  tags: EditorAutosaveTag[];
  configYaml: string;
  /** Epoch ms, this browser's clock. */
  updatedAt: number;
  /** The pipeline's `update_time` (epoch ms) these edits were based on; staleness compares server clocks only. */
  basedOnUpdateTime?: number | null;
};

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

export const isAutosaveExpired = (entry: EditorAutosaveEntry, now: number = Date.now()): boolean =>
  now - entry.updatedAt > MAX_AUTOSAVE_AGE_MS;

// Drops malformed and expired entries, writing the pruned set back.
function readAll(): EditorAutosaveEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    window.localStorage.removeItem(LEGACY_DRAFTS_STORAGE_KEY);
    const raw = window.localStorage.getItem(EDITOR_AUTOSAVE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    const entries = Array.isArray(parsed) ? parsed.filter(isAutosaveEntry) : [];
    const live = entries.filter((entry) => !isAutosaveExpired(entry));
    if (live.length !== entries.length) {
      writeAll(live);
    }
    return live;
  } catch {
    return [];
  }
}

function writeAll(entries: EditorAutosaveEntry[]): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    window.localStorage.setItem(EDITOR_AUTOSAVE_STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

function pruneForCluster(entries: EditorAutosaveEntry[], clusterId: string): EditorAutosaveEntry[] {
  const mine = entries.filter((e) => e.clusterId === clusterId).sort((a, b) => b.updatedAt - a.updatedAt);
  const others = entries.filter((e) => e.clusterId !== clusterId);
  return [...mine.slice(0, MAX_AUTOSAVE_BUFFERS), ...others];
}

type EditorAutosaveStore = {
  /** All clusters; scope with `selectAutosaveEntry`. */
  entries: EditorAutosaveEntry[];
  save: (input: EditorAutosaveInput) => boolean;
  clear: (targetKey: string) => void;
  /** For logout. */
  clearAll: () => void;
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
    // Read through storage so another tab's write isn't clobbered.
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

  clearAll: () => {
    writeAll([]);
    set({ entries: [] });
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

export const rpcnEditorAutosave = {
  save: (input: EditorAutosaveInput) => useRpcnEditorAutosaveStore.getState().save(input),
  clear: (targetKey: string) => useRpcnEditorAutosaveStore.getState().clear(targetKey),
  clearAll: () => useRpcnEditorAutosaveStore.getState().clearAll(),
  get: (targetKey: string) => selectAutosaveEntry(useRpcnEditorAutosaveStore.getState().entries, targetKey),
};
