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
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isDraftYamlTooLarge,
  MAX_DRAFT_YAML_BYTES,
  MAX_DRAFTS_PER_CLUSTER,
  newDraftId,
  PIPELINE_DRAFTS_STORAGE_KEY,
  type PipelineDraftInput,
  rpcnPipelineDrafts,
  selectDraftById,
  selectDraftForPipeline,
  selectNewPipelineDrafts,
  useRpcnPipelineDraftStore,
} from './rpcn-pipeline-drafts';

const draftInput = (overrides: Partial<PipelineDraftInput> = {}): PipelineDraftInput => ({
  id: 'draft-1',
  name: 'my pipeline',
  description: '',
  computeUnits: 1,
  tags: [],
  configYaml: 'input:\n  generate: {}\n',
  ...overrides,
});

const storedIds = () =>
  (JSON.parse(localStorage.getItem(PIPELINE_DRAFTS_STORAGE_KEY) ?? '[]') as Array<{ id: string }>).map((d) => d.id);

describe('rpcn pipeline drafts', () => {
  beforeEach(() => {
    localStorage.clear();
    config.clusterId = 'cluster-a';
    useRpcnPipelineDraftStore.getState().refresh();
  });

  it('persists a draft so it survives a reload', () => {
    const result = rpcnPipelineDrafts.save(draftInput({ configYaml: 'input: {}' }));

    expect(result).toMatchObject({ ok: true, draft: { id: 'draft-1', clusterId: 'cluster-a' }, evicted: [] });
    expect(storedIds()).toEqual(['draft-1']);

    // A fresh read (as a reload would do) sees the same draft.
    useRpcnPipelineDraftStore.getState().refresh();
    expect(selectDraftById(useRpcnPipelineDraftStore.getState().drafts, 'draft-1')?.configYaml).toBe('input: {}');
  });

  it('replaces a draft on re-save rather than accumulating copies', () => {
    rpcnPipelineDrafts.save(draftInput({ configYaml: 'first' }));
    rpcnPipelineDrafts.save(draftInput({ configYaml: 'second' }));

    expect(storedIds()).toEqual(['draft-1']);
    expect(rpcnPipelineDrafts.getById('draft-1')?.configYaml).toBe('second');
  });

  it('keeps drafts from other clusters out of the current one', () => {
    rpcnPipelineDrafts.save(draftInput({ id: 'draft-a' }));
    config.clusterId = 'cluster-b';
    rpcnPipelineDrafts.save(draftInput({ id: 'draft-b' }));

    const { drafts } = useRpcnPipelineDraftStore.getState();
    expect(selectNewPipelineDrafts(drafts).map((d) => d.id)).toEqual(['draft-b']);
    expect(selectDraftById(drafts, 'draft-a')).toBeNull();

    config.clusterId = 'cluster-a';
    expect(selectNewPipelineDrafts(useRpcnPipelineDraftStore.getState().drafts).map((d) => d.id)).toEqual(['draft-a']);
  });

  it('separates new-pipeline drafts from unsaved edits to a deployed pipeline', () => {
    rpcnPipelineDrafts.save(draftInput({ id: 'draft-new' }));
    rpcnPipelineDrafts.save(draftInput({ id: 'draft-edit', pipelineId: 'pipe-1' }));

    const { drafts } = useRpcnPipelineDraftStore.getState();
    expect(selectNewPipelineDrafts(drafts).map((d) => d.id)).toEqual(['draft-new']);
    expect(selectDraftForPipeline(drafts, 'pipe-1')?.id).toBe('draft-edit');
    expect(selectDraftForPipeline(drafts, 'pipe-2')).toBeNull();
    expect(selectDraftForPipeline(drafts, undefined)).toBeNull();
  });

  it('orders new-pipeline drafts newest first', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      rpcnPipelineDrafts.save(draftInput({ id: 'older' }));
      vi.setSystemTime(new Date('2026-01-01T01:00:00Z'));
      rpcnPipelineDrafts.save(draftInput({ id: 'newer' }));
    } finally {
      vi.useRealTimers();
    }

    expect(selectNewPipelineDrafts(useRpcnPipelineDraftStore.getState().drafts).map((d) => d.id)).toEqual([
      'newer',
      'older',
    ]);
  });

  it('evicts the stalest drafts once a cluster is over the cap', () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < MAX_DRAFTS_PER_CLUSTER + 3; i++) {
        vi.setSystemTime(new Date(Date.UTC(2026, 0, 1, 0, i)));
        rpcnPipelineDrafts.save(draftInput({ id: `draft-${i}` }));
      }
    } finally {
      vi.useRealTimers();
    }

    const ids = selectNewPipelineDrafts(useRpcnPipelineDraftStore.getState().drafts).map((d) => d.id);
    expect(ids).toHaveLength(MAX_DRAFTS_PER_CLUSTER);
    expect(ids).toContain(`draft-${MAX_DRAFTS_PER_CLUSTER + 2}`);
    expect(ids).not.toContain('draft-0');
  });

  it('reports which drafts it evicted, so eviction is never silent data loss', () => {
    vi.useFakeTimers();
    let last: ReturnType<typeof rpcnPipelineDrafts.save> | undefined;
    try {
      for (let i = 0; i <= MAX_DRAFTS_PER_CLUSTER; i++) {
        vi.setSystemTime(new Date(Date.UTC(2026, 0, 1, 0, i)));
        last = rpcnPipelineDrafts.save(draftInput({ id: `draft-${i}`, name: `pipeline ${i}` }));
      }
    } finally {
      vi.useRealTimers();
    }

    // The 26th save pushes out the stalest one, and names it.
    expect(last).toMatchObject({ ok: true, evicted: [{ id: 'draft-0', name: 'pipeline 0' }] });
  });

  it("doesn't evict another cluster's drafts to make room", () => {
    config.clusterId = 'cluster-b';
    rpcnPipelineDrafts.save(draftInput({ id: 'keep-me' }));
    config.clusterId = 'cluster-a';
    for (let i = 0; i < MAX_DRAFTS_PER_CLUSTER + 2; i++) {
      rpcnPipelineDrafts.save(draftInput({ id: `draft-${i}` }));
    }

    expect(storedIds()).toContain('keep-me');
  });

  it('refuses a config too large to store, rather than blowing the storage quota', () => {
    const huge = 'x'.repeat(MAX_DRAFT_YAML_BYTES + 1);
    expect(isDraftYamlTooLarge(huge)).toBe(true);
    expect(rpcnPipelineDrafts.save(draftInput({ configYaml: huge }))).toEqual({ ok: false, reason: 'too-large' });
    expect(storedIds()).toEqual([]);
  });

  it('reports failure when storage rejects the write, so the caller can say the draft was lost', () => {
    const setItem = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      expect(rpcnPipelineDrafts.save(draftInput())).toEqual({ ok: false, reason: 'storage-unavailable' });
    } finally {
      setItem.mockRestore();
    }
  });

  it('removes a draft by id, and by the pipeline it belongs to', () => {
    rpcnPipelineDrafts.save(draftInput({ id: 'draft-new' }));
    rpcnPipelineDrafts.save(draftInput({ id: 'draft-edit', pipelineId: 'pipe-1' }));

    rpcnPipelineDrafts.remove('draft-new');
    expect(storedIds()).toEqual(['draft-edit']);

    rpcnPipelineDrafts.removeForPipeline('pipe-1');
    expect(storedIds()).toEqual([]);
  });

  it('drops entries that are not drafts instead of failing the whole read', () => {
    localStorage.setItem(
      PIPELINE_DRAFTS_STORAGE_KEY,
      JSON.stringify([{ id: 'good', clusterId: 'cluster-a', configYaml: 'x', updatedAt: 1 }, { nope: true }, 42])
    );
    useRpcnPipelineDraftStore.getState().refresh();

    expect(useRpcnPipelineDraftStore.getState().drafts.map((d) => d.id)).toEqual(['good']);
  });

  it('survives storage holding something that is not JSON at all', () => {
    localStorage.setItem(PIPELINE_DRAFTS_STORAGE_KEY, 'not json');
    useRpcnPipelineDraftStore.getState().refresh();

    expect(useRpcnPipelineDraftStore.getState().drafts).toEqual([]);
  });

  it('mints unique draft ids', () => {
    expect(newDraftId()).not.toBe(newDraftId());
    expect(newDraftId()).toMatch(/^draft-/);
  });
});
