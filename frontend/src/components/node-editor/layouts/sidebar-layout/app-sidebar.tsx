'use client';

import type { ComponentProps } from 'react';

import { CommandPalette } from '@/components/node-editor/command-palette';
import { SettingsDialog } from '@/components/node-editor/settings-dialog';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/redpanda-ui/sidebar';

export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar className="border-r-0" variant="sidebar" {...props}>
      <SidebarContent>
        {/* Command Palette */}
        <SidebarGroup className="flex-1">
          <CommandPalette />
        </SidebarGroup>

        {/* Settings */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <SettingsDialog />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
