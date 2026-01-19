'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import React, { type HTMLAttributes, useContext, useEffect, useState } from 'react';

import { Button } from './button';
import { cn, type SharedProps } from '../lib/utils';

const bannerVariants = cva(
  'sticky top-0 z-40 flex w-full flex-row items-center justify-center px-4 text-center font-medium text-sm selection:bg-foreground selection:text-background',
  {
    variants: {
      variant: {
        secondary: 'bg-secondary text-secondary-foreground [&_button]:text-foreground',
        accent: 'bg-accent text-accent-foreground [&_button]:text-foreground',
        muted: 'bg-muted text-muted-foreground [&_button]:text-foreground',
        primary: 'bg-primary',
      },
    },
    defaultVariants: {
      variant: 'secondary',
    },
  }
);

type BannerContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  globalKey: string | null;
};

const BannerContext = React.createContext<BannerContextValue | null>(null);

function useBanner() {
  const context = useContext(BannerContext);
  if (!context) {
    throw new Error('Banner components must be used within a Banner');
  }
  return context;
}

interface BannerProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof bannerVariants>, SharedProps {
  height?: string;
}

function Banner({ id, height = '3rem', variant, testId, ...props }: BannerProps) {
  const [open, setOpen] = useState(true);
  const globalKey = id ? `redpanda-cloud-banner-${id}` : null;

  useEffect(() => {
    if (globalKey) {
      setOpen(localStorage.getItem(globalKey) !== 'true');
    }
  }, [globalKey]);

  if (!open) {
    return null;
  }

  return (
    <BannerContext.Provider value={{ open, setOpen, globalKey }}>
      <div
        data-testid={testId}
        id={id}
        {...props}
        className={cn(bannerVariants({ variant }), !open && 'hidden', props.className)}
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
      aria-label="Close Banner"
      onClick={() => {
        setOpen(false);
        if (globalKey) {
          localStorage.setItem(globalKey, 'true');
        }
      }}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      <X />
    </Button>
  );
}

export { Banner, BannerContent, BannerClose, bannerVariants };
