'use client';

import React from 'react';
import { TooltipProvider, useTooltipProviderDepth } from '../tooltip';
import { useIsMobile } from '../../lib/use-mobile';
import { cn } from '../../lib/utils';

const SIDEBAR_COOKIE_NAME = 'sidebar_state';
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = '16rem';
const SIDEBAR_WIDTH_ICON = '3rem';
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

interface SidebarContextProps {
  isMobile: boolean;
  open: boolean;
  openMobile: boolean;
  setOpen: (open: boolean) => void;
  setOpenMobile: (open: boolean) => void;
  state: 'expanded' | 'collapsed';
  toggleSidebar: () => void;
  tooltipProviderDepth: number;
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (context === null) {
    throw new Error('useSidebar must be used within a SidebarProvider.');
  }

  return context;
}

type SidebarProviderProps = React.ComponentProps<'div'> & {
  defaultOpen?: boolean | undefined;
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** Top offset for a fixed banner (e.g. '40px'): pushes the desktop sidebar/inset down. The mobile Sheet is intentionally not offset. */
  bannerHeight?: string | undefined;
};

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  bannerHeight,
  className,
  style,
  children,
  ...props
}: SidebarProviderProps) {
  // The timing-free wrapper below shares its parent group, or creates the root group.
  const tooltipProviderDepth = Math.max(1, useTooltipProviderDepth());
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);

  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const open = openProp ?? internalOpen;
  function setOpen(newValue: boolean | ((currentValue: boolean) => boolean)): void {
    const openState = typeof newValue === 'function' ? newValue(open) : newValue;
    if (setOpenProp === undefined) {
      setInternalOpen(openState);
    } else {
      setOpenProp(openState);
    }
    document.cookie = `${SIDEBAR_COOKIE_NAME}=${String(openState)}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
  }

  function toggleSidebar(): void {
    if (isMobile) {
      setOpenMobile((isOpen) => !isOpen);
    } else {
      setOpen((isOpen) => !isOpen);
    }
  }

  const handleKeyDown = React.useEffectEvent((event: KeyboardEvent) => {
    if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      toggleSidebar();
    }
  });
  React.useEffect(function subscribeToSidebarShortcut() {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Exposed as data-state="expanded"/"collapsed" for Tailwind styling.
  const state = open ? 'expanded' : 'collapsed';

  const contextValue: SidebarContextProps = {
    state,
    open,
    setOpen,
    isMobile,
    openMobile,
    setOpenMobile,
    toggleSidebar,
    tooltipProviderDepth,
  };

  const sidebarStyle: React.CSSProperties & {
    '--sidebar-width': string;
    '--sidebar-width-icon': string;
    '--banner-height'?: string | undefined;
  } = {
    '--sidebar-width': SIDEBAR_WIDTH,
    '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
    '--banner-height': bannerHeight === '' ? undefined : bannerHeight,
    ...style,
  };

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider>
        <div
          className={cn(
            'group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar',
            bannerHeight !== undefined && bannerHeight !== ''
              ? '[&_[data-slot=sidebar-container]]:top-(--banner-height) [&_[data-slot=sidebar-container]]:h-[calc(100svh-var(--banner-height))] [&_[data-slot=sidebar-inset]]:mt-(--banner-height)'
              : bannerHeight,
            className
          )}
          data-slot="sidebar-wrapper"
          style={sidebarStyle}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

export { SidebarProvider, type SidebarProviderProps, useSidebar };
