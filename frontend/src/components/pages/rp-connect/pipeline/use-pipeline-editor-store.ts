/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { editor } from 'monaco-editor';
import { createContext, createElement, type ReactNode, useContext, useRef } from 'react';
import { useStore } from 'zustand';
import { createStore, type StateCreator, type StoreApi } from 'zustand/vanilla';

import type { ConnectComponentType } from '../types/schema';
import { type RedpandaSetupResultLike, tryPatchRedpandaYaml } from '../utils/yaml';

type CommandMenuFilter = 'all' | 'variables' | 'secrets' | 'topics' | 'users' | null;
type AddConnectorType = ConnectComponentType | 'resource' | null;
type ConnectorSection = 'input' | 'output';
export type ViewLane = 'monitor' | 'configuration' | 'visual';
export type EditLane = 'yaml' | 'visual' | 'changes';

type DocumentSlice = {
  yamlContent: string;
  initialYaml: string | null;
  hydratedPipelineId: string | null;
  baselineUpdateTime: number | null;
  allowNavigation: boolean;
  setYamlContent: (yamlContent: string) => void;
  patchComponent: (section: ConnectorSection, componentName: string, patch: RedpandaSetupResultLike) => boolean;
  hydrateFromServer: (pipelineId: string, configYaml: string, updateTime?: number | null) => void;
  // Resolve the create-mode starting YAML; seeds the baseline only once.
  resolveInitialYaml: (yaml: string) => void;
  markSavedBaseline: (yaml: string, updateTime?: number | null) => void;
  setAllowNavigation: (allowNavigation: boolean) => void;
};

type UiSlice = {
  editorInstance: editor.IStandaloneCodeEditor | null;
  activeViewLane: ViewLane;
  activeEditLane: EditLane;
  selectedNodeId: string | null;
  revealNodeId: string | null;
  commandMenuFilter: CommandMenuFilter;
  addConnectorType: AddConnectorType;
  isConfigDialogOpen: boolean;
  isViewConfigDialogOpen: boolean;
  isDeleteAlertOpen: boolean;
  isTemplateDialogOpen: boolean;
  editUndoStack: string[];
  editRedoStack: string[];
  editBaseline: string | null;
  recordEdit: (next: string) => void;
  commitEditHistory: (next: { undo: string[]; redo: string[]; baseline: string }) => void;
  pendingEditCommit: (() => void) | null;
  setPendingEditCommit: (fn: (() => void) | null) => void;
  setEditorInstance: (editorInstance: editor.IStandaloneCodeEditor | null) => void;
  setActiveViewLane: (activeViewLane: ViewLane) => void;
  setActiveEditLane: (activeEditLane: EditLane) => void;
  setSelectedNodeId: (selectedNodeId: string | null) => void;
  requestRevealNode: (revealNodeId: string | null) => void;
  setCommandMenuFilter: (commandMenuFilter: CommandMenuFilter) => void;
  setAddConnectorType: (addConnectorType: AddConnectorType) => void;
  setIsConfigDialogOpen: (open: boolean) => void;
  setIsViewConfigDialogOpen: (open: boolean) => void;
  setIsDeleteAlertOpen: (open: boolean) => void;
  setIsTemplateDialogOpen: (open: boolean) => void;
};

export type PipelineEditorStore = DocumentSlice & UiSlice;

const createDocumentSlice: StateCreator<PipelineEditorStore, [], [], DocumentSlice> = (set, get) => ({
  yamlContent: '',
  initialYaml: null,
  hydratedPipelineId: null,
  baselineUpdateTime: null,
  allowNavigation: false,
  setYamlContent: (yamlContent) => set({ yamlContent }),
  patchComponent: (section, componentName, patch) => {
    const patched = tryPatchRedpandaYaml(get().yamlContent, section, componentName, patch);
    if (patched === undefined) {
      return false;
    }
    set({ yamlContent: patched });
    return true;
  },
  hydrateFromServer: (pipelineId, configYaml, updateTime = null) =>
    set({
      hydratedPipelineId: pipelineId,
      yamlContent: configYaml,
      initialYaml: configYaml,
      baselineUpdateTime: updateTime,
      editUndoStack: [],
      editRedoStack: [],
      editBaseline: null,
    }),
  resolveInitialYaml: (yaml) =>
    set((state) =>
      state.initialYaml === null
        ? { yamlContent: yaml, initialYaml: yaml, editUndoStack: [], editRedoStack: [], editBaseline: null }
        : { yamlContent: yaml }
    ),
  markSavedBaseline: (yaml, updateTime = null) => set({ initialYaml: yaml, baselineUpdateTime: updateTime }),
  setAllowNavigation: (allowNavigation) => set({ allowNavigation }),
});

const createUiSlice: StateCreator<PipelineEditorStore, [], [], UiSlice> = (set) => ({
  editorInstance: null,
  activeViewLane: 'monitor',
  activeEditLane: 'yaml',
  selectedNodeId: null,
  revealNodeId: null,
  commandMenuFilter: null,
  addConnectorType: null,
  isConfigDialogOpen: false,
  isViewConfigDialogOpen: false,
  isDeleteAlertOpen: false,
  isTemplateDialogOpen: false,
  editUndoStack: [],
  editRedoStack: [],
  editBaseline: null,
  recordEdit: (next) =>
    set((s) => {
      if (s.editBaseline === null) {
        return { editBaseline: next };
      }
      if (next === s.editBaseline) {
        return {};
      }
      return { editUndoStack: [...s.editUndoStack, s.editBaseline], editRedoStack: [], editBaseline: next };
    }),
  commitEditHistory: ({ undo, redo, baseline }) =>
    set({ editUndoStack: undo, editRedoStack: redo, editBaseline: baseline }),
  pendingEditCommit: null,
  setPendingEditCommit: (pendingEditCommit) => set({ pendingEditCommit }),
  setEditorInstance: (editorInstance) => set({ editorInstance }),
  setActiveViewLane: (activeViewLane) => set({ activeViewLane }),
  setActiveEditLane: (activeEditLane) => set({ activeEditLane }),
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  requestRevealNode: (revealNodeId) => set({ revealNodeId }),
  setCommandMenuFilter: (commandMenuFilter) => set({ commandMenuFilter }),
  setAddConnectorType: (addConnectorType) => set({ addConnectorType }),
  setIsConfigDialogOpen: (open) => set({ isConfigDialogOpen: open }),
  setIsViewConfigDialogOpen: (open) => set({ isViewConfigDialogOpen: open }),
  setIsDeleteAlertOpen: (open) => set({ isDeleteAlertOpen: open }),
  setIsTemplateDialogOpen: (open) => set({ isTemplateDialogOpen: open }),
});

export function createPipelineEditorStore(overrides?: Partial<PipelineEditorStore>): StoreApi<PipelineEditorStore> {
  return createStore<PipelineEditorStore>()((...args) => ({
    ...createDocumentSlice(...args),
    ...createUiSlice(...args),
    ...overrides,
  }));
}

const PipelineEditorContext = createContext<StoreApi<PipelineEditorStore> | null>(null);

export function PipelineEditorProvider({
  children,
  initialEditLane = 'yaml',
}: {
  children: ReactNode;
  initialEditLane?: EditLane;
}) {
  const storeRef = useRef<StoreApi<PipelineEditorStore>>(undefined);
  if (!storeRef.current) {
    storeRef.current = createPipelineEditorStore({
      activeEditLane: initialEditLane,
    });
  }
  return createElement(PipelineEditorContext.Provider, { value: storeRef.current }, children);
}

function usePipelineEditorStoreContext(): StoreApi<PipelineEditorStore> {
  const store = useContext(PipelineEditorContext);
  if (!store) {
    throw new Error('usePipelineEditorStore must be used within a PipelineEditorProvider');
  }
  return store;
}

export function usePipelineEditorStore<T>(selector: (state: PipelineEditorStore) => T): T {
  return useStore(usePipelineEditorStoreContext(), selector);
}

export function usePipelineEditorStoreApi(): StoreApi<PipelineEditorStore> {
  return usePipelineEditorStoreContext();
}
