'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import React, { type HTMLAttributes, useContext, useEffect, useState } from 'react';

import { Button, type ButtonVariants } from './button';
import { cn, type SharedProps } from '../lib/utils';

const bannerVariants = cva(
  'sticky top-0 z-40 flex w-full flex-row items-center justify-between gap-4 px-4 text-left font-medium text-body selection:bg-selection selection:text-selection-foreground',
  {
    variants: {
      variant: {
        secondary: 'bg-secondary text-secondary-foreground',
        brand: 'bg-brand text-brand-foreground',
        muted: 'bg-surface-subtle text-subtle',
        primary: 'bg-primary text-primary-foreground',
      },
    },
    defaultVariants: {
      variant: 'secondary',
    },
  }
);

/** No `open`: the provider only renders while the banner is open, so a consumer could only read `true`. */
type BannerContextValue = {
  setOpen: (open: boolean) => void;
  globalKey: string | null;
};

const BannerContext = React.createContext<BannerContextValue | null>(null);

/**
 * Safari in private mode throws on `localStorage`, and a dismissed banner is not worth taking the app
 * with it. Reading throws too, not just writing, so both sides are guarded: unreadable means "not
 * dismissed", which shows the banner — the safe way to be wrong about a notice.
 */
const isDismissed = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
};

const markDismissed = (key: string): void => {
  try {
    localStorage.setItem(key, 'true');
  } catch {
    // Persisting is an optimisation; the banner still closes for this session.
  }
};

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
      setOpen(!isDismissed(globalKey));
    }
  }, [globalKey]);

  // Unmounted rather than hidden, so a dismissed banner takes no layout and holds no focusable child.
  // Nothing below needs a `hidden` class for the closed state — there is no closed state down here.
  if (!open) {
    return null;
  }

  return (
    <BannerContext.Provider value={{ setOpen, globalKey }}>
      <div
        data-testid={testId}
        id={id}
        {...props}
        className={cn(bannerVariants({ variant }), props.className)}
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
    <div
      {...props}
      className={cn('flex-1 selection:bg-selection selection:text-selection-foreground', props.className)}
    >
      {props.children}
    </div>
  );
}

interface BannerCloseProps extends HTMLAttributes<HTMLButtonElement>, ButtonVariants {}

// Inherits the Banner's ink: naming a colour cannot stay visible across four fills and two themes.
function BannerClose({ variant = 'current-ghost', className, ...props }: BannerCloseProps) {
  const { setOpen, globalKey } = useBanner();

  return (
    <Button
      aria-label="Close Banner"
      className={className}
      onClick={() => {
        setOpen(false);
        if (globalKey) {
          markDismissed(globalKey);
        }
      }}
      size="icon-sm"
      type="button"
      variant={variant}
      {...props}
    >
      <X />
    </Button>
  );
}

export { Banner, BannerContent, BannerClose, bannerVariants };
