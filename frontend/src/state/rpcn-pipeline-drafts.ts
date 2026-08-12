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
 * Local drafts for Redpanda Connect pipelines.
 *
 * The dataplane validates `config_yaml` on both CreatePipeline and UpdatePipeline and rejects
 * anything that doesn't lint clean, so a half-written pipeline cannot be persisted server-side at
 * all. Drafts fill that gap browser-side: they hold the editor's full state (settings + YAML) until
 * the config is deployable, at which point the pipeline is created for real and the draft is dropped.
 *
 * Consequences worth knowing: a draft lives in one browser profile only — it isn't shared with
 * teammates, doesn't sync across devices, and clearing site data loses it. Deployed pipelines are
 * always the source of truth; a draft never shadows one.
 */

export const PIPELINE_DRAFTS_STORAGE_KEY = 'rpcn-pipeline-drafts';

/** Oldest drafts beyond this are evicted per cluster, so storage can't grow without bound. */
export const MAX_DRAFTS_PER_CLUSTER = 25;

/**
 * Refused above this size. localStorage gives ~5 MB per origin for the whole app, and a pipeline
 * config that large is pathological — 256 KB is far past the biggest real config.
 */
export const MAX_DRAFT_YAML_BYTES = 256 * 1024;

export type PipelineDraftTag = { key: string; value: string };

export type PipelineDraft = {
  /** Local id, stable across saves. Also the `?draft=` search param on the create route. */
  id: string;
  /** Cluster the draft was written against; drafts never cross clusters. */
  clusterId: string;
  /** Set when the draft holds unsaved edits to a pipeline that already exists on the server. */
  pipelineId?: string;
  name: string;
  description: string;
  computeUnits: number;
  tags: PipelineDraftTag[];
  configYaml: string;
  /** Epoch ms of the last local save. */
  updatedAt: number;
};

/** Everything a draft carries except the fields the store stamps itself. */
export type PipelineDraftInput = Omit<PipelineDraft, 'clusterId' | 'updatedAt'>;

const currentClusterId = (): string => config.clusterId || 'default';

export const isDraftYamlTooLarge = (configYaml: string): boolean =>
  // Rough byte count: YAML is overwhelmingly ASCII, and the cap is an order of magnitude
  // above real configs, so a per-char estimate is close enough to guard storage.
  new Blob([configYaml]).size > MAX_DRAFT_YAML_BYTES;

/** `crypto.randomUUID` where available (all supported browsers), with a plain fallback for tests. */
export function newDraftId(): string {
  try {
    return `draft-${crypto.randomUUID()}`;
  } catch {
    return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function isPipelineDraft(value: unknown): value is PipelineDraft {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const draft = value as Partial<PipelineDraft>;
  return (
    typeof draft.id === 'string' &&
    typeof draft.clusterId === 'string' &&
    typeof draft.configYaml === 'string' &&
    typeof draft.updatedAt === 'number'
  );
}

/** Tolerant read: anything unparseable or shape-shifted (older format, hand-edited) is dropped. */
function readAll(): PipelineDraft[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(PIPELINE_DRAFTS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter(isPipelineDraft) : [];
  } catch {
    return [];
  }
}

/** Reports whether the write landed, so callers can tell the user when a draft wasn't kept. */
function writeAll(drafts: PipelineDraft[]): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    window.localStorage.setItem(PIPELINE_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    return true;
  } catch {
    // Storage blocked (private mode) or over quota. The draft is lost, and the caller says so.
    return false;
  }
}

/**
 * Newest first, capped per cluster — an over-quota cluster loses its stalest drafts. The evicted ones
 * come back so the caller can say what was dropped: silent eviction is unannounced data loss.
 */
function pruneForCluster(
  drafts: PipelineDraft[],
  clusterId: string
): { kept: PipelineDraft[]; evicted: PipelineDraft[] } {
  const mine = drafts.filter((d) => d.clusterId === clusterId).sort((a, b) => b.updatedAt - a.updatedAt);
  const others = drafts.filter((d) => d.clusterId !== clusterId);
  return {
    kept: [...mine.slice(0, MAX_DRAFTS_PER_CLUSTER), ...others],
    evicted: mine.slice(MAX_DRAFTS_PER_CLUSTER),
  };
}

/** Why a draft couldn't be kept, so the caller can explain it rather than failing vaguely. */
export type SaveDraftFailure = 'too-large' | 'storage-unavailable';

export type SaveDraftResult =
  | { ok: true; draft: PipelineDraft; evicted: PipelineDraft[] }
  | { ok: false; reason: SaveDraftFailure };

type PipelineDraftStore = {
  /** Every draft in storage, across clusters. Use the selectors below to scope to the current one. */
  drafts: PipelineDraft[];
  /**
   * Insert or replace a draft (matched on `id`) and persist it. The result carries any drafts evicted
   * to stay under the per-cluster cap, so the caller can tell the user what it dropped.
   */
  saveDraft: (input: PipelineDraftInput) => SaveDraftResult;
  removeDraft: (id: string) => void;
  /** Drop the draft attached to a deployed pipeline (called once its edits land server-side). */
  removeDraftForPipeline: (pipelineId: string) => void;
  /** Re-read from storage — for another tab's writes, and to reset between tests. */
  refresh: () => void;
};

export const useRpcnPipelineDraftStore = create<PipelineDraftStore>()((set) => ({
  drafts: readAll(),

  saveDraft: (input) => {
    if (isDraftYamlTooLarge(input.configYaml)) {
      return { ok: false, reason: 'too-large' };
    }
    const draft: PipelineDraft = {
      ...input,
      clusterId: currentClusterId(),
      updatedAt: Date.now(),
    };
    // Read through storage rather than trusting in-memory state, so a draft written by another
    // tab isn't clobbered by this one's stale snapshot.
    const { kept, evicted } = pruneForCluster([...readAll().filter((d) => d.id !== draft.id), draft], draft.clusterId);
    if (!writeAll(kept)) {
      return { ok: false, reason: 'storage-unavailable' };
    }
    set({ drafts: kept });
    return { ok: true, draft, evicted };
  },

  removeDraft: (id) => {
    const next = readAll().filter((d) => d.id !== id);
    writeAll(next);
    set({ drafts: next });
  },

  removeDraftForPipeline: (pipelineId) => {
    const next = readAll().filter((d) => d.pipelineId !== pipelineId);
    writeAll(next);
    set({ drafts: next });
  },

  refresh: () => set({ drafts: readAll() }),
}));

const EMPTY_DRAFTS: PipelineDraft[] = [];

/** Drafts for the current cluster that have never been deployed, newest first. */
export function selectNewPipelineDrafts(drafts: PipelineDraft[]): PipelineDraft[] {
  const clusterId = currentClusterId();
  const mine = drafts.filter((d) => d.clusterId === clusterId && !d.pipelineId);
  return mine.length === 0 ? EMPTY_DRAFTS : mine.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** The unsaved-edits draft for a deployed pipeline, if any. */
export function selectDraftForPipeline(drafts: PipelineDraft[], pipelineId: string | undefined): PipelineDraft | null {
  if (!pipelineId) {
    return null;
  }
  const clusterId = currentClusterId();
  return drafts.find((d) => d.clusterId === clusterId && d.pipelineId === pipelineId) ?? null;
}

export function selectDraftById(drafts: PipelineDraft[], id: string | undefined): PipelineDraft | null {
  if (!id) {
    return null;
  }
  const clusterId = currentClusterId();
  return drafts.find((d) => d.clusterId === clusterId && d.id === id) ?? null;
}

/** Imperative API for callbacks and non-hook contexts. */
export const rpcnPipelineDrafts = {
  save: (input: PipelineDraftInput) => useRpcnPipelineDraftStore.getState().saveDraft(input),
  remove: (id: string) => useRpcnPipelineDraftStore.getState().removeDraft(id),
  removeForPipeline: (pipelineId: string) => useRpcnPipelineDraftStore.getState().removeDraftForPipeline(pipelineId),
  getById: (id: string) => selectDraftById(useRpcnPipelineDraftStore.getState().drafts, id),
  getForPipeline: (pipelineId: string) =>
    selectDraftForPipeline(useRpcnPipelineDraftStore.getState().drafts, pipelineId),
};
