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
export type ViewLane = 'monitor' | 'configuration';

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
  commandMenuFilter: CommandMenuFilter;
  addConnectorType: AddConnectorType;
  slashTipVisible: boolean;
  isConfigDialogOpen: boolean;
  isViewConfigDialogOpen: boolean;
  isDeleteAlertOpen: boolean;
  isTemplateDialogOpen: boolean;
  setEditorInstance: (editorInstance: editor.IStandaloneCodeEditor | null) => void;
  setActiveViewLane: (activeViewLane: ViewLane) => void;
  setCommandMenuFilter: (commandMenuFilter: CommandMenuFilter) => void;
  setAddConnectorType: (addConnectorType: AddConnectorType) => void;
  setSlashTipVisible: (slashTipVisible: boolean) => void;
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
    set({ hydratedPipelineId: pipelineId, yamlContent: configYaml, initialYaml: configYaml }),
  resolveInitialYaml: (yaml) => set((state) => ({ yamlContent: yaml, initialYaml: state.initialYaml ?? yaml })),
  setAllowNavigation: (allowNavigation) => set({ allowNavigation }),
});

const createUiSlice: StateCreator<PipelineEditorStore, [], [], UiSlice> = (set) => ({
  editorInstance: null,
  activeViewLane: 'monitor',
  commandMenuFilter: null,
  addConnectorType: null,
  slashTipVisible: false,
  isConfigDialogOpen: false,
  isViewConfigDialogOpen: false,
  isDeleteAlertOpen: false,
  isTemplateDialogOpen: false,
  setEditorInstance: (editorInstance) => set({ editorInstance }),
  setActiveViewLane: (activeViewLane) => set({ activeViewLane }),
  setCommandMenuFilter: (commandMenuFilter) => set({ commandMenuFilter }),
  setAddConnectorType: (addConnectorType) => set({ addConnectorType }),
  setSlashTipVisible: (slashTipVisible) => set({ slashTipVisible }),
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
  initialSlashTipVisible,
}: {
  children: ReactNode;
  initialSlashTipVisible: boolean;
}) {
  const storeRef = useRef<StoreApi<PipelineEditorStore>>(undefined);
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

export function usePipelineEditorStore<T>(selector: (state: PipelineEditorStore) => T): T {
  return useStore(usePipelineEditorStoreContext(), selector);
}

// Imperative handle for reading/writing without subscribing (callbacks, guards).
export function usePipelineEditorStoreApi(): StoreApi<PipelineEditorStore> {
  return usePipelineEditorStoreContext();
}
