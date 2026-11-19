'use client';

import type { VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import React, { type HTMLAttributes, useContext, useState } from 'react';
import { Button, type ButtonVariants } from './button';
import { cn, type SharedProps } from '../lib/utils';
import { bannerVariants } from './banner/variants';

/** No `open`: the provider only renders while the banner is open, so a consumer could only read `true`. */
interface BannerContextValue {
  globalKey: string | null;
  setOpen: (open: boolean) => void;
}

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
  if (context === null) {
    throw new Error('Banner components must be used within a Banner');
  }
  return context;
}

interface BannerProps extends React.ComponentProps<'div'>, VariantProps<typeof bannerVariants>, SharedProps {
  height?: string | undefined;
}

interface BannerContentRootProps extends BannerProps {
  globalKey: string | null;
}

function BannerContentRoot({ globalKey, id, height, style, variant, testId, ...props }: BannerContentRootProps) {
  const [open, setOpen] = useState(() => (globalKey !== null && globalKey !== '' ? !isDismissed(globalKey) : true));

  // Unmounted rather than hidden, so a dismissed banner takes no layout and holds no focusable child.
  // Nothing below needs a `hidden` class for the closed state — there is no closed state down here.
  if (!open) {
    return null;
  }

  const { height: styleHeight, ...consumerStyle } = style ?? {};
  const resolvedHeight = height ?? styleHeight ?? '3rem';
  const bannerStyle: React.CSSProperties & { '--banner-height': string } = {
    ...consumerStyle,
    '--banner-height': typeof resolvedHeight === 'number' ? `${resolvedHeight}px` : resolvedHeight,
  };

  return (
    <BannerContext.Provider value={{ setOpen, globalKey }}>
      <div
        data-testid={testId}
        id={id}
        {...props}
        className={cn(bannerVariants({ variant }), 'h-(--banner-height)', props.className)}
        style={bannerStyle}
      >
        {props.children}
      </div>
    </BannerContext.Provider>
  );
}

function Banner(props: BannerProps) {
  const globalKey = props.id === undefined || props.id === '' ? null : `redpanda-cloud-banner-${props.id}`;
  return <BannerContentRoot {...props} globalKey={globalKey} key={globalKey ?? 'banner-without-id'} />;
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
        if (globalKey !== null && globalKey !== '') {
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

export { Banner, BannerClose, BannerContent };
