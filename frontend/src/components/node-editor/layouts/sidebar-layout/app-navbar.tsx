'use client';

import AppPopover from '@/components/node-editor/app-popover';

export function AppNavbar() {
  return (
    <div className="absolute right-4 top-4">
      <AppPopover />
    </div>
  );
}
