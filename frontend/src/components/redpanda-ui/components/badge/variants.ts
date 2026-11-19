// Copyright 2026 Redpanda Data, Inc.

import { cva, type VariantProps } from 'class-variance-authority';

export const badgeStyleVariants = cva(
  // No `!important` anywhere, so a consumer can restyle the edge: the width lives here and variants
  // set only a colour. `text-decoration-color` transitions for the `link` variant's underline.
  'group/badge inline-flex max-w-full shrink-0 items-center justify-center truncate rounded-full border font-medium transition-[color,background-color,border-color,box-shadow,text-decoration-color] selection:bg-selection selection:text-selection-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-invalid motion-reduce:transition-none [&>svg]:pointer-events-none',
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

type BadgeVariantKey = NonNullable<VariantProps<typeof badgeStyleVariants>['variant']>;
export type BadgeSize = VariantProps<typeof badgeStyleVariants>['size'];

const BADGE_TONES = new Set<BadgeTone>([
  'default',
  'primary',
  'brand',
  'informative',
  'success',
  'warning',
  'destructive',
]);

/** Semantic appearance shared by Badge and its public class recipe. */
export interface BadgeAppearance {
  disabled?: boolean | undefined;
  size?: BadgeSize | undefined;
  tone?: BadgeTone | undefined;
  variant?: BadgeEmphasis | undefined;
}

function toneToVariant(tone: BadgeTone, emphasis: BadgeEmphasis): BadgeVariantKey {
  if (emphasis === 'solid') {
    return tone;
  }
  return `${tone}-${emphasis === 'subtle' ? 'inverted' : 'outline'}`;
}

function isBadgeEmphasis(value: unknown): value is BadgeEmphasis {
  return value === 'solid' || value === 'subtle' || value === 'outline';
}

export function resolveBadgeVariant(tone: BadgeTone, variant: BadgeEmphasis, disabled: boolean): BadgeVariantKey {
  if (!isBadgeEmphasis(variant)) {
    throw new RangeError('Badge variant must be solid, subtle, or outline.');
  }
  if (!BADGE_TONES.has(tone)) {
    throw new RangeError('Badge tone must be a supported semantic color.');
  }
  if (disabled) {
    if (variant === 'subtle') {
      return 'disabled-inverted';
    }
    return variant === 'outline' ? 'disabled-outline' : 'disabled';
  }
  return toneToVariant(tone, variant);
}

/** Build a badge recipe using the same tone, emphasis, size, and disabled contract as Badge. */
export function badgeVariants({
  tone = 'default',
  variant = 'solid',
  disabled = false,
  size,
}: BadgeAppearance = {}): string {
  return badgeStyleVariants({ variant: resolveBadgeVariant(tone, variant, disabled), size });
}
