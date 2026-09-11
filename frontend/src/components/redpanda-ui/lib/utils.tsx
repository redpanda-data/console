import { cva } from 'class-variance-authority';
import { type ClassValue, clsx } from 'clsx';
import React from 'react';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * theme.css's custom text-* utilities, by the name after `text-`. tailwind-merge buckets an
 * unrecognised `text-*` as text-COLOUR, so `cn('text-body', 'text-subtle')` would drop `text-body`;
 * ones it reads as t-shirt sizes (`2xs`) are left out. `theme-text-scale.test.ts` holds this against
 * theme.css — a name added there and not here fails as a dropped class rather than an error.
 */
export const THEME_TEXT_SCALE = [
  'body',
  'body-lg',
  'body-sm',
  'label',
  'caption',
  'lead',
  'heading-xl',
  'heading-lg',
  'heading-md',
  'heading-sm',
  'heading-xs',
  'overline',
  'overline-sm',
] as const;

const twMergeTheme = extendTailwindMerge({
  /** Declares them as font-size, so they conflict with `text-sm`…`text-9xl` and each other. */
  extend: { classGroups: { 'font-size': [{ text: [...THEME_TEXT_SCALE] }] } },
  /** Cleared, so a `leading-*` survives a font size either side of it, as it does in CSS. */
  override: { conflictingClassGroups: { 'font-size': [] } },
});

/**
 * Merge class names. One merger for every list — a second that cannot be told about the theme's
 * text-* utilities makes a list's semantics depend on whether it happens to mention one.
 */
export function cn(...inputs: ClassValue[]) {
  return twMergeTheme(clsx(...inputs));
}

export function wrapStringChild(
  child: React.ReactNode,
  Wrapper: React.ComponentType<{
    children: React.ReactNode;
    className?: string;
  }>,
  className?: string
): React.ReactNode {
  if (typeof child === 'string') {
    return <Wrapper className={className}>{child}</Wrapper>;
  }
  return child;
}

export type SharedProps = {
  testId?: string;
};

/* Portal props, in one place so a visual-regression test can open any of them the same way. */

/** Controlled open state, for Dialog, Popover, Sheet, Drawer and friends. */
export type PortalRootProps = {
  /** Controlled open state */
  open?: boolean;
  /** Uncontrolled default open state */
  defaultOpen?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
};

/** Adds non-modal mode: Dialog, Sheet, Drawer, DropdownMenu. */
export type ModalRootProps = PortalRootProps & {
  /** When false, prevents body pointer-events:none and focus trapping */
  modal?: boolean;
};

/**
 * Radix-compat auto-focus hooks. Base UI exposes neither, so everywhere but Drawer these type-check
 * and then do nothing, silently. Drawer is vaul rather than Base UI and honours `onOpenAutoFocus`.
 */
export type FocusScopeContentProps = {
  /**
   * @deprecated Honoured by Drawer only. On Base UI components use `initialFocus` on the
   * underlying `Popup`. Scheduled for removal in a future major.
   */
  onOpenAutoFocus?: (event: Event) => void;
  /**
   * @deprecated Honoured by nothing. Handle close-focus in a `ref` callback or an `onOpenChange`
   * handler. Scheduled for removal in a future major.
   */
  onCloseAutoFocus?: (event: Event) => void;
};

/** Content props: the focus hooks plus where to render. */
export type PortalContentProps = FocusScopeContentProps & {
  /** Container element for inline rendering (no portal to body) */
  container?: HTMLElement;
};

/** Fixed-position modals: Dialog, Sheet, Drawer, Credenza, AlertDialog. */
export type FixedPositionContentProps = PortalContentProps & {
  /** When false, hides the overlay/backdrop */
  showOverlay?: boolean;
};

/* Shared by StatusDot, CountDot and StatusBadge. */

export type SemanticVariant = 'success' | 'informative' | 'warning' | 'destructive' | 'disabled';
export type DotSize = 'xxs' | 'xs' | 'sm' | 'md' | 'lg';
export type StackableProps = { stacked?: boolean };

export const dotColorVariants = cva('', {
  variants: {
    variant: {
      success: 'bg-success-strong',
      informative: 'bg-informative-strong',
      warning: 'bg-warning-strong',
      destructive: 'bg-destructive-strong',
      // The `disabled` ink token, not a neutral fill: a hover token as a rest
      // value reads as a state nothing is in.
      disabled: 'bg-disabled',
    },
  },
  defaultVariants: {
    variant: 'informative',
  },
});

export const dotStackedVariants = cva('!border-background', {
  variants: {
    size: {
      xxs: 'border-[1px]',
      xs: 'border-[2px]',
      sm: 'border',
      md: 'border-[1.5px]',
      lg: 'border-2',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});
