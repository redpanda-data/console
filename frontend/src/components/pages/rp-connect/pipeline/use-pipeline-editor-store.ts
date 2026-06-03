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
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { ConnectComponentType } from '../types/schema';

type CommandMenuFilter = 'all' | 'variables' | 'secrets' | 'topics' | 'users' | null;
type AddConnectorType = ConnectComponentType | 'resource' | null;
// View-page lanes. A future 'visual' lane (full react-flow editor) slots in here.
export type ViewLane = 'monitor' | 'configuration';

type PipelineEditorState = {
  // Canonical editor content + the baseline used for the unsaved-changes guard.
  yamlContent: string;
  initialYaml: string | null;
  // Monaco instance (for slash commands + imperative focus/scroll).
  editorInstance: editor.IStandaloneCodeEditor | null;
  // Tracks which loaded pipeline the content was hydrated from, so re-renders
  // don't clobber edits.
  hydratedPipelineId: string | null;
  // Lets a successful save navigate away without tripping the guard.
  allowNavigation: boolean;
  // Which view-page lane (tab) is active.
  activeViewLane: ViewLane;
  // Transient UI.
  commandMenuFilter: CommandMenuFilter;
  addConnectorType: AddConnectorType;
  slashTipVisible: boolean;
  isConfigDialogOpen: boolean;
  isViewConfigDialogOpen: boolean;
  isDeleteAlertOpen: boolean;
  isTemplateDialogOpen: boolean;
};

type PipelineEditorActions = {
  setYamlContent: (yamlContent: string) => void;
  setEditorInstance: (editorInstance: editor.IStandaloneCodeEditor | null) => void;
  // Hydrate from a freshly-loaded server pipeline (sets content + baseline + id).
  hydrateFromServer: (pipelineId: string, configYaml: string) => void;
  // Resolve the create-mode starting YAML; only seeds the baseline once.
  resolveInitialYaml: (yaml: string) => void;
  setAllowNavigation: (allowNavigation: boolean) => void;
  setActiveViewLane: (activeViewLane: ViewLane) => void;
  setCommandMenuFilter: (commandMenuFilter: CommandMenuFilter) => void;
  setAddConnectorType: (addConnectorType: AddConnectorType) => void;
  setSlashTipVisible: (slashTipVisible: boolean) => void;
  setIsConfigDialogOpen: (open: boolean) => void;
  setIsViewConfigDialogOpen: (open: boolean) => void;
  setIsDeleteAlertOpen: (open: boolean) => void;
  setIsTemplateDialogOpen: (open: boolean) => void;
};

export type PipelineEditorStore = PipelineEditorState & PipelineEditorActions;

const createInitialState = (overrides?: Partial<PipelineEditorState>): PipelineEditorState => ({
  yamlContent: '',
  initialYaml: null,
  editorInstance: null,
  hydratedPipelineId: null,
  allowNavigation: false,
  activeViewLane: 'monitor',
  commandMenuFilter: null,
  addConnectorType: null,
  slashTipVisible: false,
  isConfigDialogOpen: false,
  isViewConfigDialogOpen: false,
  isDeleteAlertOpen: false,
  isTemplateDialogOpen: false,
  ...overrides,
});

export function createPipelineEditorStore(overrides?: Partial<PipelineEditorState>): StoreApi<PipelineEditorStore> {
  return createStore<PipelineEditorStore>()((set) => ({
    ...createInitialState(overrides),
    setYamlContent: (yamlContent) => set({ yamlContent }),
    setEditorInstance: (editorInstance) => set({ editorInstance }),
    hydrateFromServer: (pipelineId, configYaml) =>
      set({ hydratedPipelineId: pipelineId, yamlContent: configYaml, initialYaml: configYaml }),
    resolveInitialYaml: (yaml) => set((state) => ({ yamlContent: yaml, initialYaml: state.initialYaml ?? yaml })),
    setAllowNavigation: (allowNavigation) => set({ allowNavigation }),
    setActiveViewLane: (activeViewLane) => set({ activeViewLane }),
    setCommandMenuFilter: (commandMenuFilter) => set({ commandMenuFilter }),
    setAddConnectorType: (addConnectorType) => set({ addConnectorType }),
    setSlashTipVisible: (slashTipVisible) => set({ slashTipVisible }),
    setIsConfigDialogOpen: (open) => set({ isConfigDialogOpen: open }),
    setIsViewConfigDialogOpen: (open) => set({ isViewConfigDialogOpen: open }),
    setIsDeleteAlertOpen: (open) => set({ isDeleteAlertOpen: open }),
    setIsTemplateDialogOpen: (open) => set({ isTemplateDialogOpen: open }),
  }));
}

const PipelineEditorContext = createContext<StoreApi<PipelineEditorStore> | null>(null);

// Context-scoped so each PipelinePage mount gets its own store — no state leaks
// across navigations between pipelines/modes.
export function PipelineEditorProvider({
  children,
  initialSlashTipVisible,
}: {
  children: ReactNode;
  initialSlashTipVisible: boolean;
}) {
  const storeRef = useRef<StoreApi<PipelineEditorStore>>();
  if (!storeRef.current) {
    storeRef.current = createPipelineEditorStore({ slashTipVisible: initialSlashTipVisible });
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

// Subscribe to a slice of the store.
export function usePipelineEditorStore<T>(selector: (state: PipelineEditorStore) => T): T {
  return useStore(usePipelineEditorStoreContext(), selector);
}

// Imperative handle for reading/writing without subscribing (callbacks, guards).
export function usePipelineEditorStoreApi(): StoreApi<PipelineEditorStore> {
  return usePipelineEditorStoreContext();
}
