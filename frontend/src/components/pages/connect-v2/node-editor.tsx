import AppContextMenu from '@/components/node-editor/app-context-menu';
import { AppNavbar } from '@/components/node-editor/layouts/sidebar-layout/app-navbar';
import { AppSidebar } from '@/components/node-editor/layouts/sidebar-layout/app-sidebar';
import { NodeInspector } from '@/components/node-editor/node-inspector';
import { AppStoreProvider, useAppStore } from '@/components/node-editor/store';
import { defaultState } from '@/components/node-editor/store/app-store';
import { ThemeProvider } from '@/components/node-editor/theme-provider';
import Workflow from '@/components/node-editor/workflow';
import { Credenza, CredenzaContent } from '@/components/redpanda-ui/credenza';
import { SidebarInset, SidebarProvider } from '@/components/redpanda-ui/sidebar';
import { ReactFlowProvider } from '@xyflow/react';
import { useShallow } from 'zustand/react/shallow';

const DEFAULT_THEME = 'dark';

const NodeEditorContent = () => {
  return (
    <ThemeProvider defaultTheme={DEFAULT_THEME} storageKey="redpanda-ui-theme">
      <ReactFlowProvider>
        {/* Container with CSS overrides to make sidebar relative positioned */}
        <div className="h-screen w-full flex [&_[data-slot=sidebar-container]]:!static [&_[data-slot=sidebar-container]]:!h-full [&_[data-slot=sidebar-container]]:!flex [&_[data-slot=sidebar-container]]:!inset-auto [&_[data-slot=sidebar-container]]:!z-auto">
          <SidebarProvider>
            <AppSidebar collapsible="icon" />
            <SidebarInset className="flex-1 min-w-0">
              <div className="flex h-full flex-col">
                {/* Main content area */}
                <main className="flex-1 overflow-hidden relative">
                  <AppContextMenu>
                    <Workflow />
                  </AppContextMenu>
                  <AppNavbar />
                </main>
              </div>
            </SidebarInset>
          </SidebarProvider>
          <NodeInspectorModal />
        </div>
      </ReactFlowProvider>
    </ThemeProvider>
  );
};

const NodeInspectorModal = () => {
  const { isOpen, closeInspector } = useAppStore(
    useShallow((state) => ({
      isOpen: state.isNodeInspectorOpen,
      closeInspector: state.closeNodeInspector,
    })),
  );

  return (
    <Credenza open={isOpen} onOpenChange={closeInspector}>
      <CredenzaContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0">
        <NodeInspector onClose={closeInspector} />
      </CredenzaContent>
    </Credenza>
  );
};

export const NodeEditor = () => {
  return (
    <AppStoreProvider initialState={{ ...defaultState, colorMode: DEFAULT_THEME }}>
      <NodeEditorContent />
    </AppStoreProvider>
  );
};
