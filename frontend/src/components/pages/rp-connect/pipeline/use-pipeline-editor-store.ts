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
// Edit-mode lanes: YAML editor vs. visual editor.
export type EditLane = 'yaml' | 'visual';

// Canonical config YAML (plus baseline) that all views read/mutate through these actions.
type DocumentSlice = {
  yamlContent: string;
  initialYaml: string | null;
  hydratedPipelineId: string | null;
  // Lets a successful save navigate away without tripping the unsaved-changes guard.
  allowNavigation: boolean;
  setYamlContent: (yamlContent: string) => void;
  // Patch one redpanda component; returns false if the YAML couldn't be parsed/patched.
  patchComponent: (section: ConnectorSection, componentName: string, patch: RedpandaSetupResultLike) => boolean;
  // Hydrate from a freshly-loaded server pipeline (content + baseline + id).
  hydrateFromServer: (pipelineId: string, configYaml: string) => void;
  // Resolve the create-mode starting YAML; seeds the baseline only once.
  resolveInitialYaml: (yaml: string) => void;
  setAllowNavigation: (allowNavigation: boolean) => void;
};

// Transient editor-page UI: Monaco handle, active lane, dialog/menu flags.
type UiSlice = {
  editorInstance: editor.IStandaloneCodeEditor | null;
  activeViewLane: ViewLane;
  activeEditLane: EditLane;
  // Node selected in the Visual lane, mirrored here so the YAML lane can reveal it on tab switch.
  selectedNodeId: string | null;
  // One-shot request to reveal + select a node's lines in Monaco; set on Visual→YAML, cleared by the editor.
  revealNodeId: string | null;
  commandMenuFilter: CommandMenuFilter;
  addConnectorType: AddConnectorType;
  isConfigDialogOpen: boolean;
  isViewConfigDialogOpen: boolean;
  isDeleteAlertOpen: boolean;
  isTemplateDialogOpen: boolean;
  // Visual-edit undo/redo history (YAML snapshots). Lives in the store — not VisualEditorPanel —
  // so it survives lane switches. `editBaseline` is the last document state the history has seen.
  editUndoStack: string[];
  editRedoStack: string[];
  editBaseline: string | null;
  // Record a (non-undo/redo) document change; no-ops when it matches the baseline.
  recordEdit: (next: string) => void;
  // Commit the stacks + baseline after an undo/redo step.
  commitEditHistory: (next: { undo: string[]; redo: string[]; baseline: string }) => void;
  resetEditHistory: () => void;
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
  allowNavigation: false,
  setYamlContent: (yamlContent) => set({ yamlContent }),
  patchComponent: (section, componentName, patch) => {
    const patched = tryPatchRedpandaYaml(get().yamlContent, section, componentName, patch);
    if (patched === null) {
      return false;
    }
    set({ yamlContent: patched });
    return true;
  },
  hydrateFromServer: (pipelineId, configYaml) =>
    // Reset the edit history so the server load isn't recorded as an undoable step.
    set({
      hydratedPipelineId: pipelineId,
      yamlContent: configYaml,
      initialYaml: configYaml,
      editUndoStack: [],
      editRedoStack: [],
      editBaseline: null,
    }),
  resolveInitialYaml: (yaml) =>
    set((state) =>
      // First resolution establishes the document baseline — reset the edit history so the initial
      // template load isn't an undoable step. Subsequent calls only update the content.
      state.initialYaml === null
        ? { yamlContent: yaml, initialYaml: yaml, editUndoStack: [], editRedoStack: [], editBaseline: null }
        : { yamlContent: yaml }
    ),
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
        // First document the history sees becomes the baseline (no undo step).
        return { editBaseline: next };
      }
      if (next === s.editBaseline) {
        return {};
      }
      // A real change (a visual edit, or an external YAML edit seen on lane return): push the old
      // baseline as an undo step and clear the redo branch.
      return { editUndoStack: [...s.editUndoStack, s.editBaseline], editRedoStack: [], editBaseline: next };
    }),
  commitEditHistory: ({ undo, redo, baseline }) =>
    set({ editUndoStack: undo, editRedoStack: redo, editBaseline: baseline }),
  resetEditHistory: () => set({ editUndoStack: [], editRedoStack: [], editBaseline: null }),
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

// Context-scoped: each mount gets its own store (key the provider by pipeline id for clean nav).
export function PipelineEditorProvider({
  children,
  initialEditLane = 'yaml',
}: {
  children: ReactNode;
  // Edit-mode lane to open on first mount (e.g. 'visual' when the visual editor is enabled).
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

// Imperative handle for reading/writing without subscribing (callbacks, guards).
export function usePipelineEditorStoreApi(): StoreApi<PipelineEditorStore> {
  return usePipelineEditorStoreContext();
}
