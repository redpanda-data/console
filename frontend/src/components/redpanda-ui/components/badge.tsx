import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import type React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const badgeVariants = cva(
  'group/badge inline-flex max-w-full shrink-0 items-center justify-center overflow-hidden truncate text-ellipsis whitespace-nowrap rounded-full border font-medium transition-[color,box-shadow] selection:bg-selected selection:text-selected-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none',
  {
    variants: {
      variant: {
        // Flat semantic strings (the `*-inverted` / `*-outline` keys) are marked
        // deprecated below — prefer the two-axis `tone` + `variant` API.
        neutral:
          'border-transparent bg-background-inverse-subtle text-inverse [a&]:hover:bg-background-inverse-subtle-hover',
        /** @deprecated Prefer `tone` + `variant="subtle"`. */
        'neutral-inverted': 'border-transparent bg-surface-subtle [a&]:hover:bg-background-subtle-hover',
        /** @deprecated Prefer `tone` + `variant="outline"`. */
        'neutral-outline': '!border-outline-inverse border [a&]:hover:bg-background-subtle-hover',

        simple: 'text-secondary [a&]:hover:bg-background-subtle-hover',
        /** @deprecated Prefer `tone` + `variant="subtle"`. */
        'simple-inverted': 'text-secondary [a&]:hover:bg-background-subtle-hover',
        /** @deprecated Prefer `tone` + `variant="outline"`. */
        'simple-outline': '!border-outline-inverse border text-secondary [a&]:hover:bg-background-subtle-hover',

        info: 'border-transparent bg-surface-informative text-inverse [a&]:hover:bg-surface-informative-hover',
        /** @deprecated Prefer `tone="info"` + `variant="subtle"`. */
        'info-inverted':
          'border-transparent bg-background-informative-subtle text-informative [a&]:hover:bg-background-informative-subtle-hover',
        /** @deprecated Prefer `tone="info"` + `variant="outline"`. */
        'info-outline':
          'border-outline-informative bg-transparent text-informative [a&]:hover:bg-background-informative-subtle',

        accent: 'border-transparent bg-brand text-inverse [a&]:hover:bg-surface-brand-hover',
        /** @deprecated Prefer `tone="accent"` + `variant="subtle"`. */
        'accent-inverted': 'border-transparent bg-background-brand-subtle text-brand [a&]:hover:bg-brand-alpha-default',
        /** @deprecated Prefer `tone="accent"` + `variant="outline"`. */
        'accent-outline': 'border-outline-brand bg-transparent text-brand [a&]:hover:bg-brand-alpha-subtle',

        success: 'border-transparent bg-surface-success text-inverse [a&]:hover:bg-surface-success-hover',
        /** @deprecated Prefer `tone="success"` + `variant="subtle"`. */
        'success-inverted':
          'border-transparent bg-background-success-subtle text-success [a&]:hover:bg-background-success-subtle-hover',
        /** @deprecated Prefer `tone="success"` + `variant="outline"`. */
        'success-outline': 'border-outline-success bg-transparent text-success [a&]:hover:bg-background-success-subtle',

        // dark:text-inverse-primary on warning-inverted: orange can't pair >~3.6:1 on
        // orange-900, so white is the only AA-passing dark-mode option.
        warning: 'border-transparent bg-surface-warning text-warning-foreground [a&]:hover:bg-surface-warning-hover',
        /** @deprecated Prefer `tone="warning"` + `variant="subtle"`. */
        'warning-inverted':
          'border-transparent bg-background-warning-subtle text-warning dark:text-inverse-primary [a&]:hover:bg-warning-subtle',
        /** @deprecated Prefer `tone="warning"` + `variant="outline"`. */
        'warning-outline': 'border-outline-warning bg-transparent text-warning [a&]:hover:bg-background-warning-subtle',

        disabled: 'cursor-not-allowed border-transparent bg-background-disabled text-disabled',
        /** @deprecated Prefer the `disabled` prop. */
        'disabled-inverted': 'cursor-not-allowed border-transparent bg-surface-subtle text-disabled',
        /** @deprecated Prefer the `disabled` prop. */
        'disabled-outline': 'cursor-not-allowed border-border-strong bg-transparent text-disabled',

        destructive:
          'border-transparent bg-surface-error text-inverse focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-surface-error-hover',
        /** @deprecated Prefer `tone="destructive"` + `variant="subtle"`. */
        'destructive-inverted':
          'border-transparent bg-background-error-subtle text-destructive [a&]:hover:bg-destructive-subtle',
        /** @deprecated Prefer `tone="destructive"` + `variant="outline"`. */
        'destructive-outline':
          'border-outline-error bg-transparent text-destructive [a&]:hover:bg-background-error-subtle',

        secondary: 'border-transparent bg-secondary text-inverse [a&]:hover:bg-secondary/90',
        /** @deprecated Prefer `tone` + `variant="subtle"`. */
        'secondary-inverted': 'border-transparent bg-secondary/10 text-secondary [a&]:hover:bg-secondary/20',
        /** @deprecated Prefer `tone` + `variant="outline"`. */
        'secondary-outline': 'border-secondary text-secondary [a&]:hover:bg-secondary/10',

        primary: 'border-transparent bg-primary text-inverse [a&]:hover:bg-primary/90',
        /** @deprecated Prefer `tone="primary"` + `variant="subtle"`. */
        'primary-inverted': 'border-transparent bg-primary/10 text-primary [a&]:hover:bg-primary/20',
        /** @deprecated Prefer `tone="primary"` + `variant="outline"`. */
        'primary-outline': 'border-primary text-primary [a&]:hover:bg-primary/10',

        outline: 'border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',

        // shadcn aliases: `default` maps to our `neutral`; `ghost`/`link` mirror the button variants.
        default:
          'border-transparent bg-background-inverse-subtle text-inverse [a&]:hover:bg-background-inverse-subtle-hover',
        ghost: 'border-transparent bg-transparent text-action-primary [a&]:hover:bg-surface-primary-subtle',
        link: 'border-transparent bg-transparent text-primary underline-offset-4 [a&]:hover:underline',
      },
      size: {
        sm: 'h-5 gap-1 px-1.5 py-0 text-[11px] has-[>svg]:px-1 [&_svg]:size-3',
        md: 'h-6 gap-1 px-2 py-0 text-xs has-[>svg]:px-1.5 [&_svg]:size-3.5',
        lg: 'h-8 gap-1.5 px-3 py-0 text-sm has-[>svg]:px-2 [&_svg]:size-4',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'md',
    },
  }
);

/**
 * Recommended semantic color axis. Pair with {@link BadgeEmphasis} via the
 * `tone` and `variant` props: `<Badge tone="success" variant="subtle" />`.
 */
export type BadgeTone = 'neutral' | 'primary' | 'accent' | 'info' | 'success' | 'warning' | 'destructive';

/** Recommended emphasis axis. `subtle` is the soft-fill style (formerly `*-inverted`). */
export type BadgeEmphasis = 'solid' | 'subtle' | 'outline';

/**
 * @deprecated Use the two-axis `tone` + `variant` (solid|subtle|outline) API instead.
 * The flat semantic strings (e.g. `success-inverted`, `primary-outline`) are retained for
 * back-compat and render identically, but will be removed in a future major version.
 * Migration: `variant="success-inverted"` → `tone="success" variant="subtle"`.
 */
export type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];
export type BadgeSize = VariantProps<typeof badgeVariants>['size'];

const EMPHASIS_VALUES = new Set<BadgeEmphasis>(['solid', 'subtle', 'outline']);

const isEmphasis = (value: unknown): value is BadgeEmphasis => EMPHASIS_VALUES.has(value as BadgeEmphasis);

/** Map a (tone, emphasis) pair to the underlying flat `badgeVariants` key. */
function toneToVariant(tone: BadgeTone, emphasis: BadgeEmphasis): BadgeVariant {
  if (emphasis === 'solid') {
    return tone;
  }
  return `${tone}-${emphasis === 'subtle' ? 'inverted' : 'outline'}` as BadgeVariant;
}

/**
 * Resolve the two-axis API (and disabled state) down to a single flat
 * `badgeVariants` key, preserving back-compat for deprecated flat strings.
 */
function resolveBadgeVariant(tone: BadgeTone | undefined, variant: BadgeEmphasis | BadgeVariant, disabled: boolean) {
  if (disabled) {
    if (variant === 'subtle') {
      return 'disabled-inverted';
    }
    if (variant === 'outline') {
      return 'disabled-outline';
    }
    return 'disabled';
  }
  // Two-axis path: an explicit tone means `variant` is read as an emphasis (default solid).
  if (tone) {
    return toneToVariant(tone, isEmphasis(variant) ? variant : 'solid');
  }
  // Emphasis shorthand without a tone falls back to the neutral tone.
  if (variant === 'solid') {
    return 'neutral';
  }
  if (variant === 'subtle') {
    return 'neutral-inverted';
  }
  // Anything else is a (deprecated) flat variant string — including the generic `outline`.
  return variant as BadgeVariant;
}

export type BadgeProps = useRender.ComponentProps<'span'> &
  SharedProps & {
    icon?: React.ReactNode;
    /** Semantic color. Recommended; pair with `variant` for emphasis. */
    tone?: BadgeTone;
    /**
     * Emphasis (`solid` | `subtle` | `outline`) when `tone` is set. Deprecated flat
     * strings (e.g. `success-inverted`) are still accepted — see {@link BadgeVariant}.
     */
    variant?: BadgeEmphasis | BadgeVariant;
    size?: BadgeSize;
    /** Renders the disabled appearance regardless of `tone`. */
    disabled?: boolean;
  };

function Badge({
  className,
  tone,
  variant = 'solid',
  size,
  testId,
  icon,
  children,
  render,
  disabled = false,
  ...props
}: BadgeProps) {
  const resolvedVariant = resolveBadgeVariant(tone, variant, disabled);
  // A custom `render` element owns its children (no `icon` composition); the default span composes `icon` + children.
  let content: React.ReactNode = children;
  if (!render) {
    // Only wrap string children; non-string children need the badge's inline-flex layout.
    const wrappedChildren = typeof children === 'string' ? <span className="truncate">{children}</span> : children;

    if (icon && children) {
      content = (
        <>
          {icon}
          {wrappedChildren}
        </>
      );
    } else if (icon) {
      content = icon;
    } else {
      content = wrappedChildren;
    }
  }

  return useRender({
    defaultTagName: 'span',
    render,
    state: {
      slot: 'badge',
      variant: resolvedVariant,
    },
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ variant: resolvedVariant, size }), className),
        'data-testid': testId,
        'aria-disabled': disabled || undefined,
        children: content,
      } as React.ComponentPropsWithRef<'span'>,
      props
    ),
  });
}

export { Badge, badgeVariants };
