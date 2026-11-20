'use client';

import { Dialog } from '@base-ui/react/dialog';
import type React from 'react';
import { usePortalContainer } from '../../lib/use-portal-container';
import { cn } from '../../lib/utils';
import { useSidebar } from './sidebar-context';

interface MobileSidebarProps extends React.ComponentProps<'div'> {
  side: 'left' | 'right';
}

/** A navigation dialog owns its edge-to-edge surface, not a repainted form sheet. */
export function MobileSidebar({ children, className, side, style, ...props }: MobileSidebarProps) {
  const { openMobile, setOpenMobile } = useSidebar();
  const container = usePortalContainer();
  const sidebarStyle: React.CSSProperties & { '--sidebar-width': string } = {
    ...style,
    '--sidebar-width': '18rem',
  };
  return (
    <Dialog.Root onOpenChange={setOpenMobile} open={openMobile}>
      <Dialog.Portal container={container}>
        <Dialog.Backdrop
          className="fixed inset-0 z-50 bg-modal-overlay transition-opacity duration-500 ease-in-out data-[ending-style]:opacity-0 data-[ending-style]:duration-300 data-[starting-style]:opacity-0 motion-reduce:transition-none"
          data-slot="sidebar-overlay"
        />
        <Dialog.Popup
          aria-modal="true"
          className={cn(
            'fixed inset-y-0 z-50 h-full w-(--sidebar-width) bg-sidebar text-sidebar-foreground shadow-lg transition-transform duration-500 ease-in-out data-[ending-style]:duration-300 motion-reduce:transition-none',
            side === 'left'
              ? 'left-0 border-r data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full'
              : 'right-0 border-l data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full',
            className
          )}
          data-mobile="true"
          data-side={side}
          data-sidebar="sidebar"
          data-slot="sidebar"
          style={sidebarStyle}
          {...props}
        >
          <div className="sr-only">
            <Dialog.Title>Sidebar</Dialog.Title>
            <Dialog.Description>Displays the mobile sidebar.</Dialog.Description>
          </div>
          {children}
          <Dialog.Close className="absolute top-2 right-2 z-20 rounded-md bg-sidebar px-3 py-2 text-sidebar-foreground outline-none [clip-path:inset(50%)] focus:[clip-path:none] focus-visible:ring-3 focus-visible:ring-sidebar-ring/50">
            Close sidebar
          </Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
