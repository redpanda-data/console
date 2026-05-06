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

import { InfoIcon } from 'lucide-react';
import { useState } from 'react';

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '../../../redpanda-ui/components/drawer';

type Props = {
  short: string;
  title: string;
  children: React.ReactNode;
};

export function DescriptionWithHelp({ short, title, children }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <span className="inline-flex items-center gap-1.5">
        {short}
        <button
          aria-label="More information"
          className="inline-flex cursor-pointer items-center text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(true)}
          type="button"
        >
          <InfoIcon className="h-4 w-4" />
        </button>
      </span>
      <Drawer direction="right" onOpenChange={setOpen} open={open}>
        <DrawerContent aria-labelledby="help-drawer-title" className="w-[520px] sm:max-w-[520px]" role="dialog">
          <DrawerHeader className="border-b">
            <DrawerTitle id="help-drawer-title">{title}</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-4 p-6">{children}</div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
