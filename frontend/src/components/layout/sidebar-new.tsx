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

import { useColorMode } from '@redpanda-data/ui';
import { Avatar, AvatarFallback, AvatarImage } from 'components/redpanda-ui/components/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'components/redpanda-ui/components/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from 'components/redpanda-ui/components/sidebar';
import { APP_ROUTES, createVisibleSidebarItems } from 'components/routes';
import { ChevronsLeft, ChevronsRight, ChevronUp, LogOut, Settings } from 'lucide-react';
import { observer } from 'mobx-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import RedpandaIconColor from '../../assets/logos/redpanda-icon-color.svg';
import RedpandaIconWhite from '../../assets/logos/redpanda-icon-white.svg';
import RedpandaTextColor from '../../assets/logos/redpanda-text-color.svg';
import RedpandaTextWhite from '../../assets/logos/redpanda-text-white.svg';
import { AuthenticationMethod } from '../../protogen/redpanda/api/console/v1alpha1/authentication_pb';
import { api } from '../../state/backend-api';
import { AppFeatures } from '../../utils/env';
import { UserPreferencesDialog } from '../misc/user-preferences';

function SidebarLogo() {
  const { state, isMobile } = useSidebar();
  const { colorMode } = useColorMode();

  const isExpanded = isMobile || state === 'expanded';
  const isDark = colorMode === 'dark';

  const fullLogo = isDark ? RedpandaTextWhite : RedpandaTextColor;
  const iconLogo = isDark ? RedpandaIconWhite : RedpandaIconColor;

  return (
    <Link aria-label="Go to Overview" className="flex items-center" to="/overview">
      <img alt="" className={isExpanded ? 'h-6' : 'h-6 w-6'} src={isExpanded ? fullLogo : iconLogo} />
    </Link>
  );
}

function SidebarCollapseToggle() {
  const { toggleSidebar, state } = useSidebar();
  const isExpanded = state === 'expanded';

  return (
    <SidebarMenuButton
      aria-expanded={isExpanded}
      aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
      onClick={toggleSidebar}
      tooltip={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
    >
      {isExpanded ? (
        <ChevronsLeft aria-hidden="true" className="size-4" />
      ) : (
        <ChevronsRight aria-hidden="true" className="size-4" />
      )}
      <span className="group-data-[collapsible=icon]:hidden">{isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}</span>
    </SidebarMenuButton>
  );
}

const UserProfileNew = observer(() => {
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const { state, isMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    api.refreshUserData().catch(() => {
      // Error handling managed by API layer
    });
  }, []);

  if (!(AppFeatures.SINGLE_SIGN_ON && api.userData)) {
    return null;
  }

  if (api.userData.authenticationMethod === AuthenticationMethod.NONE) {
    return null;
  }

  const user = api.userData;
  const initials = user.displayName
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handleMenuItemClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            aria-label={`User menu for ${user.displayName}`}
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            size="lg"
            tooltip={state === 'collapsed' ? user.displayName : undefined}
          >
            <Avatar className="h-8 w-8">
              <AvatarImage alt="" src={user.avatarUrl} />
              <AvatarFallback aria-hidden="true">{initials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-semibold">{user.displayName}</span>
              <span className="truncate text-sidebar-foreground/60 text-xs">Preferences</span>
            </div>
            <ChevronUp aria-hidden="true" className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-lg" side={isMobile ? 'bottom' : 'top'}>
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span>Signed in as</span>
              <span className="font-normal text-muted-foreground">{user.displayName}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              handleMenuItemClick();
              setPreferencesOpen(true);
            }}
          >
            <Settings aria-hidden="true" className="mr-2 h-4 w-4" />
            Preferences
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={async () => {
              handleMenuItemClick();
              await api.logout();
              window.location.reload();
            }}
          >
            <LogOut aria-hidden="true" className="mr-2 h-4 w-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <UserPreferencesDialog isOpen={preferencesOpen} onClose={() => setPreferencesOpen(false)} />
    </>
  );
});

type NavItemProps = {
  item: ReturnType<typeof createVisibleSidebarItems>[number];
  isActive: boolean;
  onNavClick: () => void;
};

function SidebarNavItem({ item, isActive, onNavClick }: NavItemProps) {
  const Icon = item.icon;
  const titleString = typeof item.title === 'string' ? item.title : item.to;

  const itemContent = (
    <>
      {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0" /> : null}
      <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
    </>
  );

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        aria-current={isActive ? 'page' : undefined}
        aria-disabled={item.isDisabled}
        asChild={!item.isDisabled}
        className={item.isDisabled ? 'cursor-not-allowed opacity-50' : ''}
        disabled={item.isDisabled}
        isActive={isActive}
        tooltip={item.isDisabled ? { children: item.disabledText } : titleString}
      >
        {item.isDisabled ? (
          <span className="flex items-center gap-2" role="link">
            {itemContent}
          </span>
        ) : (
          <Link aria-current={isActive ? 'page' : undefined} onClick={onNavClick} to={item.to}>
            {itemContent}
          </Link>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

const SidebarNavigation = observer(() => {
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const sidebarItems = createVisibleSidebarItems(APP_ROUTES);

  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <nav aria-label="Main navigation">
      <SidebarMenu>
        {sidebarItems.map((item) => {
          const isActive =
            location.pathname === item.to || (item.to !== '/overview' && location.pathname.startsWith(`${item.to}/`));
          return <SidebarNavItem isActive={isActive} item={item} key={item.to} onNavClick={handleNavClick} />;
        })}
      </SidebarMenu>
    </nav>
  );
});

export function AppSidebarNew() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="mt-3.5 flex items-center px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <SidebarLogo />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarNavigation />
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserProfileNew />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarCollapseToggle />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

type SidebarLayoutProps = {
  children: React.ReactNode;
};

export function SidebarLayout({ children }: SidebarLayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebarNew />
      {children}
    </SidebarProvider>
  );
}
