import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import type React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const badgeVariants = cva(
  // No `!important` anywhere, so a consumer can restyle the edge: the width lives here and variants
  // set only a colour. `text-decoration-color` transitions for the `link` variant's underline.
  'group/badge inline-flex max-w-full shrink-0 items-center justify-center overflow-hidden truncate text-ellipsis whitespace-nowrap rounded-full border font-medium transition-[color,background-color,border-color,box-shadow,text-decoration-color] selection:bg-selection selection:text-selection-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-invalid motion-reduce:transition-none [&>svg]:pointer-events-none',
  {
    variants: {
      variant: {
        // `:is(a, button)` rather than shadcn's `[a&]`, so a Badge rendered as a button reacts too.
        // No `active:`: the click navigates or removes, which is the feedback.
        default: 'border-transparent bg-secondary text-secondary-foreground [&:is(a,button)]:hover:bg-secondary-hover',
        'default-inverted':
          'border-transparent bg-secondary-wash text-secondary [&:is(a,button)]:hover:bg-secondary-wash-pressed',
        'default-outline':
          'border-secondary-line text-secondary [&:is(a,button)]:hover:border-secondary-line-hover [&:is(a,button)]:hover:bg-secondary-wash',

        // Transparent at rest, so hover tints in rather than jumping to an opaque ground.
        simple: 'text-secondary [&:is(a,button)]:hover:bg-accent',

        informative:
          'border-transparent bg-surface-informative text-informative-foreground [&:is(a,button)]:hover:bg-surface-informative-hover',
        'informative-inverted':
          'border-transparent bg-informative-wash text-informative [&:is(a,button)]:hover:bg-informative-wash-pressed',
        'informative-outline':
          'border-informative-line bg-transparent text-informative [&:is(a,button)]:hover:border-informative-line-hover [&:is(a,button)]:hover:bg-informative-wash',

        brand: 'border-transparent bg-brand text-brand-foreground [&:is(a,button)]:hover:bg-brand-hover',
        'brand-inverted': 'border-transparent bg-brand-wash text-brand [&:is(a,button)]:hover:bg-brand-wash-pressed',
        'brand-outline':
          'border-brand-line bg-transparent text-brand [&:is(a,button)]:hover:border-brand-line-hover [&:is(a,button)]:hover:bg-brand-wash',

        success:
          'border-transparent bg-surface-success text-success-foreground [&:is(a,button)]:hover:bg-surface-success-hover',
        'success-inverted':
          'border-transparent bg-success-wash text-success [&:is(a,button)]:hover:bg-success-wash-pressed',
        'success-outline':
          'border-success-line bg-transparent text-success [&:is(a,button)]:hover:border-success-line-hover [&:is(a,button)]:hover:bg-success-wash',

        warning:
          'border-transparent bg-surface-warning text-warning-foreground [&:is(a,button)]:hover:bg-surface-warning-hover',
        'warning-inverted':
          'border-transparent bg-warning-wash text-warning [&:is(a,button)]:hover:bg-warning-wash-pressed',
        'warning-outline':
          'border-warning-line bg-transparent text-warning [&:is(a,button)]:hover:border-warning-line-hover [&:is(a,button)]:hover:bg-warning-wash',

        disabled: 'cursor-not-allowed border-transparent bg-surface-disabled text-disabled',
        'disabled-inverted': 'cursor-not-allowed border-transparent bg-surface-subtle text-disabled',
        'disabled-outline': 'cursor-not-allowed border-border bg-transparent text-disabled',

        destructive:
          'border-transparent bg-surface-destructive text-destructive-foreground focus-visible:ring-destructive/50 [&:is(a,button)]:hover:bg-surface-destructive-hover',
        'destructive-inverted':
          'border-transparent bg-destructive-wash text-destructive [&:is(a,button)]:hover:bg-destructive-wash-pressed',
        'destructive-outline':
          'border-destructive-line bg-transparent text-destructive [&:is(a,button)]:hover:border-destructive-line-hover [&:is(a,button)]:hover:bg-destructive-wash',

        primary: 'border-transparent bg-primary text-primary-foreground [&:is(a,button)]:hover:bg-primary-hover',
        'primary-inverted':
          'border-transparent bg-primary-wash text-primary [&:is(a,button)]:hover:bg-primary-wash-pressed',
        'primary-outline':
          'border-primary-line text-primary [&:is(a,button)]:hover:border-primary-line-hover [&:is(a,button)]:hover:bg-primary-wash',

        outline:
          'border-border text-foreground [&:is(a,button)]:hover:bg-accent [&:is(a,button)]:hover:text-accent-foreground',

        ghost: 'border-transparent bg-transparent text-secondary [&:is(a,button)]:hover:bg-secondary-wash',
        link: 'link-standalone border-transparent bg-transparent text-action-primary',
      },
      size: {
        sm: 'h-5 gap-1 px-1.5 py-0 text-2xs has-[>svg]:px-1 [&_svg]:size-3',
        md: 'h-6 gap-1 px-2 py-0 text-body-sm has-[>svg]:px-1.5 [&_svg]:size-3.5',
        lg: 'h-8 gap-1.5 px-3 py-0 text-body has-[>svg]:px-2 [&_svg]:size-4',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

/** Recommended colour axis. Pair with {@link BadgeEmphasis}: `<Badge tone="success" variant="subtle" />`. */
export type BadgeTone = 'default' | 'primary' | 'brand' | 'informative' | 'success' | 'warning' | 'destructive';

/** Recommended emphasis axis. `subtle` is the soft-fill style (formerly `*-inverted`). */
export type BadgeEmphasis = 'solid' | 'subtle' | 'outline';

/**
 * The flat strings still worth naming directly. The `<tone>-inverted` / `<tone>-outline` keys the
 * two-axis API resolves to are deliberately absent: they are the implementation, not the API.
 */
export type BadgeVariant = 'simple' | 'outline' | 'ghost' | 'link' | 'disabled';

/**
 * Every key `badgeVariants` declares, including the ones only the resolver names. Exported for
 * callers of `badgeVariants` itself — it is not the Badge `variant` prop surface, which is narrower.
 */
export type BadgeVariantKey = NonNullable<VariantProps<typeof badgeVariants>['variant']>;
export type BadgeSize = VariantProps<typeof badgeVariants>['size'];

const EMPHASIS_VALUES = new Set<BadgeEmphasis>(['solid', 'subtle', 'outline']);

const isEmphasis = (value: unknown): value is BadgeEmphasis => EMPHASIS_VALUES.has(value as BadgeEmphasis);

/** Map a (tone, emphasis) pair to the underlying flat `badgeVariants` key. */
function toneToVariant(tone: BadgeTone, emphasis: BadgeEmphasis): BadgeVariantKey {
  if (emphasis === 'solid') {
    return tone;
  }
  return `${tone}-${emphasis === 'subtle' ? 'inverted' : 'outline'}` as BadgeVariantKey;
}

/** The two-axis API and disabled state, down to one flat `badgeVariants` key. */
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
    return 'default';
  }
  if (variant === 'subtle') {
    return 'default-inverted';
  }
  // Anything else is one of the public flat strings — including the generic `outline`.
  return variant as BadgeVariantKey;
}

export type BadgeProps = useRender.ComponentProps<'span'> &
  SharedProps & {
    icon?: React.ReactNode;
    /** Semantic color. Recommended; pair with `variant` for emphasis. */
    tone?: BadgeTone;
    /** Emphasis when `tone` is set. Deprecated flat strings still work — see {@link BadgeVariant}. */
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
  // A custom `render` element owns its children (no `icon` composition); the default span composes
  // `icon` + children, wrapping only string children — others need the badge's own inline-flex layout.
  let content: React.ReactNode = children;
  if (!render) {
    const label = typeof children === 'string' ? <span className="truncate">{children}</span> : children;
    content =
      icon && children ? (
        <>
          {icon}
          {label}
        </>
      ) : (
        (icon ?? label)
      );
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
