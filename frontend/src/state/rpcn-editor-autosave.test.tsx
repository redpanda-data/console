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

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted so the module factory below can close over it (vi.mock is lifted to the top of the file).
const { mockConfig } = vi.hoisted(() => ({ mockConfig: { clusterId: 'cluster-a' } }));
vi.mock('config', () => ({ config: mockConfig }));

import {
  autosaveTargetKey,
  CREATE_AUTOSAVE_TARGET,
  EDITOR_AUTOSAVE_STORAGE_KEY,
  type EditorAutosaveInput,
  MAX_AUTOSAVE_BUFFERS,
  MAX_AUTOSAVE_YAML_BYTES,
  rpcnEditorAutosave,
  selectAutosaveEntry,
  useRpcnEditorAutosaveStore,
} from './rpcn-editor-autosave';

const buffer = (overrides: Partial<EditorAutosaveInput> = {}): EditorAutosaveInput => ({
  targetKey: CREATE_AUTOSAVE_TARGET,
  name: 'work in progress',
  description: '',
  computeUnits: 1,
  tags: [],
  configYaml: 'input:\n  half_written',
  ...overrides,
});

const stored = () => JSON.parse(localStorage.getItem(EDITOR_AUTOSAVE_STORAGE_KEY) ?? '[]');

describe('rpcn-editor-autosave', () => {
  beforeEach(() => {
    localStorage.clear();
    mockConfig.clusterId = 'cluster-a';
    useRpcnEditorAutosaveStore.getState().refresh();
  });

  it('keys the create page and each pipeline separately', () => {
    expect(autosaveTargetKey(undefined)).toBe(CREATE_AUTOSAVE_TARGET);
    expect(autosaveTargetKey('')).toBe(CREATE_AUTOSAVE_TARGET);
    expect(autosaveTargetKey('pipeline-1')).toBe('pipeline-1');
  });

  it('survives a reload, which is the entire point', () => {
    rpcnEditorAutosave.save(buffer({ configYaml: 'input:\n  mid_sentence' }));

    // A fresh read of storage, as a reloaded page would do.
    useRpcnEditorAutosaveStore.setState({ entries: [] });
    useRpcnEditorAutosaveStore.getState().refresh();

    expect(rpcnEditorAutosave.get(CREATE_AUTOSAVE_TARGET)?.configYaml).toBe('input:\n  mid_sentence');
  });

  // One buffer per editor, not a history: the point is the last thing typed, not every version of it.
  it('replaces the buffer for a target rather than accumulating', () => {
    rpcnEditorAutosave.save(buffer({ configYaml: 'first' }));
    rpcnEditorAutosave.save(buffer({ configYaml: 'second' }));

    expect(stored()).toHaveLength(1);
    expect(rpcnEditorAutosave.get(CREATE_AUTOSAVE_TARGET)?.configYaml).toBe('second');
  });

  it('keeps a buffer per pipeline', () => {
    rpcnEditorAutosave.save(buffer({ targetKey: 'p1', configYaml: 'one' }));
    rpcnEditorAutosave.save(buffer({ targetKey: 'p2', configYaml: 'two' }));

    expect(rpcnEditorAutosave.get('p1')?.configYaml).toBe('one');
    expect(rpcnEditorAutosave.get('p2')?.configYaml).toBe('two');
  });

  it('never offers one cluster its work from another', () => {
    rpcnEditorAutosave.save(buffer({ targetKey: 'p1', configYaml: 'from cluster a' }));

    mockConfig.clusterId = 'cluster-b';
    expect(rpcnEditorAutosave.get('p1')).toBeNull();

    rpcnEditorAutosave.save(buffer({ targetKey: 'p1', configYaml: 'from cluster b' }));
    expect(rpcnEditorAutosave.get('p1')?.configYaml).toBe('from cluster b');

    mockConfig.clusterId = 'cluster-a';
    expect(rpcnEditorAutosave.get('p1')?.configYaml).toBe('from cluster a');
  });

  it('clears only the target it is asked to clear', () => {
    rpcnEditorAutosave.save(buffer({ targetKey: 'p1' }));
    rpcnEditorAutosave.save(buffer({ targetKey: 'p2' }));

    rpcnEditorAutosave.clear('p1');

    expect(rpcnEditorAutosave.get('p1')).toBeNull();
    expect(rpcnEditorAutosave.get('p2')).not.toBeNull();
  });

  it('evicts the stalest buffers past the cap', () => {
    for (let i = 0; i < MAX_AUTOSAVE_BUFFERS + 3; i++) {
      // Distinct timestamps, so "stalest" is well-defined.
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, i));
      rpcnEditorAutosave.save(buffer({ targetKey: `p${i}` }));
    }
    vi.useRealTimers();

    const entries = stored() as Array<{ targetKey: string }>;
    expect(entries).toHaveLength(MAX_AUTOSAVE_BUFFERS);
    expect(entries.map((e) => e.targetKey)).not.toContain('p0');
    expect(entries.map((e) => e.targetKey)).toContain(`p${MAX_AUTOSAVE_BUFFERS + 2}`);
  });

  it('refuses a config too large to keep, rather than blowing the storage quota', () => {
    expect(rpcnEditorAutosave.save(buffer({ configYaml: 'x'.repeat(MAX_AUTOSAVE_YAML_BYTES + 1) }))).toBe(false);
    expect(stored()).toHaveLength(0);
  });

  it('reports a refusal when storage is unavailable, instead of pretending it saved', () => {
    const setItem = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(rpcnEditorAutosave.save(buffer())).toBe(false);

    setItem.mockRestore();
  });

  // Another tab's buffer must not be clobbered by this tab's stale snapshot.
  it('writes through storage rather than over an in-memory snapshot', () => {
    rpcnEditorAutosave.save(buffer({ targetKey: 'p1' }));
    // Simulate another tab: write directly, leaving this store's state behind.
    const otherTab = [
      ...stored(),
      {
        targetKey: 'p2',
        clusterId: 'cluster-a',
        name: 'other tab',
        description: '',
        computeUnits: 1,
        tags: [],
        configYaml: 'from the other tab',
        updatedAt: Date.now(),
      },
    ];
    localStorage.setItem(EDITOR_AUTOSAVE_STORAGE_KEY, JSON.stringify(otherTab));

    rpcnEditorAutosave.save(buffer({ targetKey: 'p1', configYaml: 'updated here' }));

    expect(stored()).toHaveLength(2);
    expect(rpcnEditorAutosave.get('p2')?.configYaml).toBe('from the other tab');
  });

  it('drops anything unparseable instead of failing to load', () => {
    localStorage.setItem(EDITOR_AUTOSAVE_STORAGE_KEY, '{not json');
    useRpcnEditorAutosaveStore.getState().refresh();
    expect(useRpcnEditorAutosaveStore.getState().entries).toEqual([]);

    localStorage.setItem(EDITOR_AUTOSAVE_STORAGE_KEY, JSON.stringify([{ targetKey: 'p1' }, 'nonsense', null]));
    useRpcnEditorAutosaveStore.getState().refresh();
    expect(useRpcnEditorAutosaveStore.getState().entries).toEqual([]);
  });

  // The browser-local drafts prototype this replaced; superseded by server-side drafts.
  it('cleans up the storage the old local-drafts prototype left behind', () => {
    localStorage.setItem('rpcn-pipeline-drafts', JSON.stringify([{ id: 'old', configYaml: 'x' }]));

    useRpcnEditorAutosaveStore.getState().refresh();

    expect(localStorage.getItem('rpcn-pipeline-drafts')).toBeNull();
  });

  describe('selectAutosaveEntry', () => {
    it('returns nothing without a target', () => {
      expect(selectAutosaveEntry([], undefined)).toBeNull();
    });

    it('finds the buffer this cluster holds for a target', () => {
      rpcnEditorAutosave.save(buffer({ targetKey: 'p1' }));
      const { entries } = useRpcnEditorAutosaveStore.getState();
      expect(selectAutosaveEntry(entries, 'p1')?.targetKey).toBe('p1');
      expect(selectAutosaveEntry(entries, 'p2')).toBeNull();
    });
  });
});
