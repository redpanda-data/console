import AppContextMenu from '@/components/node-editor/app-context-menu';
import { AppNavbar } from '@/components/node-editor/layouts/sidebar-layout/app-navbar';
import { AppSidebar } from '@/components/node-editor/layouts/sidebar-layout/app-sidebar';
import { AppStoreProvider } from '@/components/node-editor/store';
import { defaultState } from '@/components/node-editor/store/app-store';
import { ThemeProvider } from '@/components/node-editor/theme-provider';
import Workflow from '@/components/node-editor/workflow';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/redpanda-ui/sidebar';
import { ReactFlowProvider } from '@xyflow/react';

const DEFAULT_THEME = 'dark';

export const NodeEditor = () => {
  return (
    <AppStoreProvider initialState={{ ...defaultState, colorMode: DEFAULT_THEME }}>
      <ThemeProvider defaultTheme={DEFAULT_THEME} storageKey="redpanda-ui-theme">
        <ReactFlowProvider>
          {/* Container with CSS overrides to make sidebar relative positioned */}
          <div className="h-screen w-full flex [&_[data-slot=sidebar-container]]:!static [&_[data-slot=sidebar-container]]:!h-full [&_[data-slot=sidebar-container]]:!flex [&_[data-slot=sidebar-container]]:!inset-auto [&_[data-slot=sidebar-container]]:!z-auto">
            <SidebarProvider>
              <AppSidebar collapsible="icon" />
              <SidebarInset className="flex-1 min-w-0">
                <div className="flex h-full flex-col">
                  {/* Header with sidebar trigger */}
                  <div className="flex items-center gap-2 p-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <SidebarTrigger />
                    <span className="font-semibold text-foreground">Node Editor</span>
                  </div>

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
          </div>
        </ReactFlowProvider>
      </ThemeProvider>
    </AppStoreProvider>
  );
};
