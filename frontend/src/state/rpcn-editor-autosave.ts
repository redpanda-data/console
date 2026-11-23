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
import { z } from 'zod';
import { create } from 'zustand';

export const EDITOR_AUTOSAVE_STORAGE_KEY = 'rpcn-editor-autosave';

const LEGACY_DRAFTS_STORAGE_KEY = 'rpcn-pipeline-drafts';

/** Per cluster, evicted oldest-first. */
export const MAX_AUTOSAVE_BUFFERS = 10;

/** Across clusters, so idle clusters can't multiply the per-cluster cap. */
export const MAX_AUTOSAVE_BUFFERS_TOTAL = 20;

/** Bumped on shape changes; entries from another version are dropped on read. */
export const AUTOSAVE_ENTRY_VERSION = 1;

export const MAX_AUTOSAVE_YAML_BYTES = 256 * 1024;

/** Expired buffers are dropped on read. Configs are stored verbatim, so a pasted credential must not outlive the week. */
export const MAX_AUTOSAVE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const CREATE_AUTOSAVE_TARGET = 'create';

export const autosaveTargetKey = (pipelineId?: string) => pipelineId || CREATE_AUTOSAVE_TARGET;

const attachedServiceAccountSchema = z.object({ serviceAccountId: z.string(), secretName: z.string() });

/** A service account created in the editor for the pipeline to log in with, not yet saved to it. */
export type AttachedServiceAccount = z.infer<typeof attachedServiceAccountSchema>;

const editorAutosaveEntrySchema = z.object({
  version: z.literal(AUTOSAVE_ENTRY_VERSION),
  /** `create`, or a pipeline id. */
  targetKey: z.string(),
  clusterId: z.string(),
  name: z.string(),
  description: z.string(),
  computeUnits: z.number(),
  tags: z.array(z.object({ key: z.string(), value: z.string() })),
  /** Absent from entries written before egress gateways could be picked. */
  egressGatewayIds: z.array(z.string()).optional(),
  configYaml: z.string(),
  /** Epoch ms, this browser's clock. */
  updatedAt: z.number(),
  /** The pipeline's `update_time` (epoch ms) these edits were based on; staleness compares server clocks only. */
  basedOnUpdateTime: z.number().nullish(),
  /** Lives outside the YAML, so the config's service-account login needs it restored alongside. */
  serviceAccount: attachedServiceAccountSchema.nullish(),
});

export type EditorAutosaveEntry = z.infer<typeof editorAutosaveEntrySchema>;

export type EditorAutosaveInput = Omit<EditorAutosaveEntry, 'version' | 'clusterId' | 'updatedAt'>;

const currentClusterId = () => config.clusterId || 'default';

const isAutosaveYamlTooLarge = (configYaml: string) => new Blob([configYaml]).size > MAX_AUTOSAVE_YAML_BYTES;

const isAutosaveExpired = (entry: EditorAutosaveEntry, now: number = Date.now()) =>
  now - entry.updatedAt > MAX_AUTOSAVE_AGE_MS;

function parseStoredEntries(raw: string | null) {
  const parsed: unknown = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.flatMap((entry) => {
    const result = editorAutosaveEntrySchema.safeParse(entry);
    return result.success ? [result.data] : [];
  });
}

function readAll() {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    window.localStorage.removeItem(LEGACY_DRAFTS_STORAGE_KEY);
    const entries = parseStoredEntries(window.localStorage.getItem(EDITOR_AUTOSAVE_STORAGE_KEY));
    const live = entries.filter((entry) => !isAutosaveExpired(entry));
    if (live.length !== entries.length) {
      writeAll(live);
    }
    return live;
  } catch {
    return [];
  }
}

function writeAll(entries: EditorAutosaveEntry[]) {
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

function removeAll() {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.removeItem(EDITOR_AUTOSAVE_STORAGE_KEY);
  } catch {}
}

const newestFirst = (a: EditorAutosaveEntry, b: EditorAutosaveEntry) => b.updatedAt - a.updatedAt;

function prune(entries: EditorAutosaveEntry[], clusterId: string) {
  const mine = entries.filter((e) => e.clusterId === clusterId).sort(newestFirst);
  const others = entries.filter((e) => e.clusterId !== clusterId);
  return [...mine.slice(0, MAX_AUTOSAVE_BUFFERS), ...others].sort(newestFirst).slice(0, MAX_AUTOSAVE_BUFFERS_TOTAL);
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
      version: AUTOSAVE_ENTRY_VERSION,
      clusterId: currentClusterId(),
      updatedAt: Date.now(),
    };
    const next = prune(
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
    if (!writeAll(next)) {
      removeAll();
      set({ entries: [] });
      return;
    }
    set({ entries: next });
  },

  clearAll: () => {
    removeAll();
    set({ entries: [] });
  },

  refresh: () => set({ entries: readAll() }),
}));

export function selectAutosaveEntry(entries: EditorAutosaveEntry[], targetKey: string | undefined) {
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
