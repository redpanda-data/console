'use client';

import { X } from 'lucide-react';
import React, { type HTMLAttributes, useContext, useEffect, useState } from 'react';

import { getLocalStorageFlag, setLocalStorageFlag } from '../../../hooks/use-safe-local-storage';
import { Button } from './button';
import { cn } from '../lib/utils';

interface BannerContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  globalKey: string | null;
}

const BannerContext = React.createContext<BannerContextValue | null>(null);

function useBanner() {
  const context = useContext(BannerContext);
  if (!context) {
    throw new Error('Banner components must be used within a Banner');
  }
  return context;
}

interface BannerProps extends HTMLAttributes<HTMLDivElement> {
  height?: string;
}

function Banner({ id, height = '3rem', ...props }: BannerProps) {
  const [open, setOpen] = useState(true);
  const globalKey = id ? `redpanda-cloud-banner-${id}` : null;

  useEffect(() => {
    if (globalKey) setOpen(!getLocalStorageFlag(globalKey));
  }, [globalKey]);

  if (!open) return null;

  return (
    <BannerContext.Provider value={{ open, setOpen, globalKey }}>
      <div
        id={id}
        {...props}
        className={cn(
          'sticky top-0 z-40 w-full flex flex-row items-center justify-center bg-secondary px-4 text-center text-sm font-medium text-secondary-foreground selection:bg-foreground selection:text-background [&_button]:text-foreground',
          !open && 'hidden',
          props.className,
        )}
        style={{
          height,
        }}
      >
        {props.children}
      </div>
    </BannerContext.Provider>
  );
}

interface BannerContentProps extends HTMLAttributes<HTMLDivElement> {}

function BannerContent({ ...props }: BannerContentProps) {
  return (
    <div {...props} className={cn('flex-1 selection:bg-foreground selection:text-background', props.className)}>
      {props.children}
    </div>
  );
}

interface BannerCloseProps extends HTMLAttributes<HTMLButtonElement> {}

function BannerClose({ ...props }: BannerCloseProps) {
  const { setOpen, globalKey } = useBanner();

  return (
    <Button
      type="button"
      aria-label="Close Banner"
      onClick={() => {
        setOpen(false);
        if (globalKey) setLocalStorageFlag(globalKey, true);
      }}
      variant="outline"
      size="icon"
      {...props}
    >
      <X />
    </Button>
  );
}

export { Banner, BannerContent, BannerClose };
