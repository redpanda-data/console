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

import { Link, useLocation } from '@tanstack/react-router';
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
  useSidebar,
} from 'components/redpanda-ui/components/sidebar';
import { ChevronsLeft, ChevronsRight, ChevronUp, LogOut, Settings } from 'lucide-react';
import { observer } from 'mobx-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { createVisibleSidebarItems } from 'utils/route-utils';

import RedpandaIcon from '../../assets/redpanda/redpanda-icon-next.svg';
import RedpandaLogoWhite from '../../assets/redpanda/redpanda-logo-next-white.svg';
import { AuthenticationMethod } from '../../protogen/redpanda/api/console/v1alpha1/authentication_pb';
import { api } from '../../state/backend-api';
import { AppFeatures } from '../../utils/env';
import { getUserInitials } from '../../utils/string';
import { UserPreferencesDialog } from '../misc/user-preferences';
import { Text } from '../redpanda-ui/components/typography';

function SidebarLogo() {
  const { state, isMobile } = useSidebar();

  const isExpanded = isMobile || state === 'expanded';

  return (
    <Link aria-label="Go to Overview" className="flex items-center" to="/overview">
      <img alt="" className={isExpanded ? 'h-6' : 'h-6 w-6'} src={isExpanded ? RedpandaLogoWhite : RedpandaIcon} />
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

const UserProfile = observer(() => {
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
  const initials = getUserInitials(user.displayName);

  const handleMenuItemClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const isCollapsed = state === 'collapsed';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            aria-label={`User menu for ${user.displayName}`}
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            size={isCollapsed ? 'default' : 'lg'}
            tooltip={isCollapsed ? user.displayName : undefined}
          >
            <Avatar className={isCollapsed ? 'h-7 w-7 shrink-0' : 'h-8 w-8 shrink-0'}>
              <AvatarImage alt="" src={user.avatarUrl} />
              <AvatarFallback aria-hidden="true" className="bg-primary font-medium text-primary-foreground text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            {!isCollapsed && (
              <>
                <div className="grid flex-1 text-left leading-tight">
                  <Text as="span" className="truncate" variant="label">
                    {user.displayName}
                  </Text>
                  <Text as="span" className="truncate text-sidebar-foreground/60" variant="muted">
                    Preferences
                  </Text>
                </div>
                <ChevronUp aria-hidden="true" className="ml-auto size-4" />
              </>
            )}
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-lg" side={isMobile ? 'bottom' : 'top'}>
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <Text as="span" variant="small">
                Signed in as
              </Text>
              <Text as="span" variant="muted">
                {user.displayName}
              </Text>
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
          <span className="flex items-center gap-2">{itemContent}</span>
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
  const sidebarItems = createVisibleSidebarItems();

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

export function AppSidebar() {
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
            <UserProfile />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarCollapseToggle />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

type SidebarLayoutProps = {
  children: React.ReactNode;
};

export function SidebarLayout({ children }: SidebarLayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      {children}
    </SidebarProvider>
  );
}
