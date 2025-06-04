import AppContextMenu from '@/components/node-editor/app-context-menu';
import SidebarLayout from '@/components/node-editor/layouts/sidebar-layout';
import { AppStoreProvider } from '@/components/node-editor/store';
import { defaultState } from '@/components/node-editor/store/app-store';
import { ThemeProvider } from '@/components/node-editor/theme-provider';
import Workflow from '@/components/node-editor/workflow';
import { ReactFlowProvider } from '@xyflow/react';

const DEFAULT_THEME = 'dark';

export const NodeEditor = () => {
  return (
    <AppStoreProvider initialState={{ ...defaultState, colorMode: DEFAULT_THEME }}>
      <ThemeProvider defaultTheme={DEFAULT_THEME} storageKey="redpanda-ui-theme">
        <ReactFlowProvider>
          <SidebarLayout>
            <AppContextMenu>
              <Workflow />
            </AppContextMenu>
          </SidebarLayout>
        </ReactFlowProvider>
      </ThemeProvider>
    </AppStoreProvider>
  );
};
