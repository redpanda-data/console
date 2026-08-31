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
 * Crash recovery for the pipeline editor — deliberately *not* the drafts feature. A draft is a decision
 * the user made and lives server-side in `STATE_DRAFT`; this covers the gap a draft cannot, the seconds
 * between typing something and saving it.
 *
 * One buffer per editor target, offered back as "restore what you were typing", dropped the moment a
 * real save succeeds. Never a row in any list.
 */

export const EDITOR_AUTOSAVE_STORAGE_KEY = 'rpcn-editor-autosave';

/** The earlier browser-local drafts prototype, removed on first read — nothing can read it now. */
const LEGACY_DRAFTS_STORAGE_KEY = 'rpcn-pipeline-drafts';

/** Buffers beyond this are evicted oldest-first, so editing many pipelines can't grow without bound. */
export const MAX_AUTOSAVE_BUFFERS = 10;

/** localStorage is ~5 MB per origin for the whole app, and 256 KB is far past the biggest real config. */
export const MAX_AUTOSAVE_YAML_BYTES = 256 * 1024;

/**
 * Buffers older than this are dropped on read, and the pruned set written back.
 *
 * Two reasons, and the second is why it is not just an eviction policy. Nobody
 * returning after a week wants a week-old configuration offered as "your edits" —
 * they have forgotten writing it. And a buffer holds the configuration verbatim,
 * which is normally `${secrets.NAME}` references but is whatever the user typed:
 * a literal credential pasted mid-edit should not outlive the session that typed
 * it by a month on a shared machine. `clearAll` on logout covers the deliberate
 * exit; this covers the tab that was simply closed.
 */
export const MAX_AUTOSAVE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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
  /** Epoch ms of the last autosave, by this browser's clock. */
  updatedAt: number;
  /**
   * The saved pipeline's `update_time` when these edits were captured, in epoch ms —
   * `null` while creating, or against a pipeline that has never been written since
   * the server started recording it.
   *
   * This is what decides whether a buffer is stale, and it is a server value on both
   * sides of that comparison. `updatedAt` cannot do the job: comparing this browser's
   * clock against the dataplane's makes the answer wrong in both directions once the
   * two drift, and a few minutes of drift is ordinary.
   */
  basedOnUpdateTime?: number | null;
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

export const isAutosaveExpired = (entry: EditorAutosaveEntry, now: number = Date.now()): boolean =>
  now - entry.updatedAt > MAX_AUTOSAVE_AGE_MS;

/**
 * Tolerant read: anything unparseable or shape-shifted (older format, hand-edited) is
 * dropped, as is anything past `MAX_AUTOSAVE_AGE_MS`.
 *
 * Expired buffers are written back out rather than only filtered, so the stored YAML
 * actually goes away instead of waiting for a later save to evict it — someone who
 * stops using the editor is exactly the case the age cap is for.
 */
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
  /**
   * Drop every buffer, across clusters — for logout. Unsaved work is the user's, and
   * leaving it in the browser for whoever logs in next is not this feature's job.
   */
  clearAll: () => void;
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
    // Through storage, not in-memory state, so another tab's write isn't clobbered by a stale snapshot.
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

/** Imperative API for callbacks and non-hook contexts. */
export const rpcnEditorAutosave = {
  save: (input: EditorAutosaveInput) => useRpcnEditorAutosaveStore.getState().save(input),
  clear: (targetKey: string) => useRpcnEditorAutosaveStore.getState().clear(targetKey),
  clearAll: () => useRpcnEditorAutosaveStore.getState().clearAll(),
  get: (targetKey: string) => selectAutosaveEntry(useRpcnEditorAutosaveStore.getState().entries, targetKey),
};
