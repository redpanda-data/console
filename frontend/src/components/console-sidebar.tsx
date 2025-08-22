'use client';

import { useColorMode } from '@redpanda-data/ui';
import { useBooleanFlagValue } from 'custom-feature-flag-provider';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { observer } from 'mobx-react';
import { Link, Link as RouterLink, useLocation } from 'react-router-dom';

import redpandaIconColor from '../assets/logos/redpanda-icon-color.svg';
import redpandaIconWhite from '../assets/logos/redpanda-icon-white.svg';
import redpandaTextColor from '../assets/logos/redpanda-text-color.svg';
import redpandaTextWhite from '../assets/logos/redpanda-text-white.svg';
import AppContent from './layout/Content';
import { UserProfile } from './misc/UserButton';
import { Collapsible } from './redpanda-ui/components/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from './redpanda-ui/components/sidebar';
import { cn } from './redpanda-ui/lib/utils';
import { APP_ROUTES, createVisibleSidebarItems } from './routes';

const ConsoleSidebar = observer(() => {
  const isAiAgentsEnabled = useBooleanFlagValue('enableAiAgentsInConsoleUi');
  const location = useLocation();

  const APP_ROUTES_WITHOUT_AI_AGENTS = APP_ROUTES.filter((route) => !route.path.startsWith('/agents'));
  const FINAL_APP_ROUTES = isAiAgentsEnabled ? APP_ROUTES : APP_ROUTES_WITHOUT_AI_AGENTS;
  const sidebarItems = createVisibleSidebarItems(FINAL_APP_ROUTES);

  // Helper function to determine if a sidebar item is active
  const isItemActive = (itemPath: string) => {
    // Exact match for overview
    if (itemPath === '/overview') {
      return location.pathname === '/overview' || location.pathname === '/';
    }

    // For other routes, check if current path starts with the item path
    // This handles both exact matches and sub-routes
    return location.pathname.startsWith(itemPath);
  };

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <ConsoleSidebarHeader />
        <SidebarContent>
          {/* Nav Main */}
          <SidebarGroup>
            <SidebarMenu>
              {sidebarItems.map((item) => (
                <Collapsible
                  key={item.title as string}
                  asChild
                  className={cn('group/collapsible', item.isDisabled && 'opacity-50 cursor-not-allowed')}
                  disabled={item.isDisabled}
                >
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild={!item.isDisabled}
                      disabled={item.isDisabled}
                      isActive={!item.isDisabled && isItemActive(item.to)}
                      tooltip={item.isDisabled && item.disabledText ? item.disabledText : (item.title as string)}
                    >
                      {item.isDisabled ? (
                        <div className="flex items-center gap-2">
                          {item.icon && <item.icon className="size-4 shrink-0" />}
                          <span>{item.title}</span>
                        </div>
                      ) : (
                        <Link to={item.to}>
                          {item.icon && <item.icon className="size-4 shrink-0" />}
                          <span>{item.title}</span>
                        </Link>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </Collapsible>
              ))}
            </SidebarMenu>
          </SidebarGroup>
          {/* Nav Main */}
        </SidebarContent>
        <ConsoleSidebarFooter />
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <div className="flex flex-1 flex-col p-4 pt-0">
          <AppContent />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
});

const ConsoleSidebarHeader = () => {
  const { colorMode } = useColorMode(); // Chakra UI color mode
  const { state } = useSidebar();

  return (
    <SidebarHeader>
      <div className={`flex mt-[0.875rem] items-center ${state === 'expanded' ? 'px-2' : 'justify-center'}`}>
        <RouterLink to="/" className="flex items-center">
          {colorMode === 'light' && (
            <img
              src={state === 'collapsed' ? redpandaIconColor : redpandaTextColor}
              alt="Redpanda"
              className={state === 'collapsed' ? 'h-6 w-6' : 'h-6'}
            />
          )}
          {colorMode === 'dark' && (
            <img
              src={state === 'collapsed' ? redpandaIconWhite : redpandaTextWhite}
              alt="Redpanda"
              className={state === 'collapsed' ? 'h-6 w-6' : 'h-6'}
            />
          )}
        </RouterLink>
      </div>
    </SidebarHeader>
  );
};

const ConsoleSidebarFooter = () => {
  const { state, toggleSidebar } = useSidebar();

  return (
    <SidebarFooter>
      <SidebarMenu>
        <UserProfile />
        {/* Collapse/Expand Sidebar */}
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip={state === 'collapsed' ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={toggleSidebar}
          >
            {state === 'collapsed' ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
            <span>{state === 'collapsed' ? 'Expand sidebar' : 'Collapse sidebar'}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
};

export default ConsoleSidebar;
