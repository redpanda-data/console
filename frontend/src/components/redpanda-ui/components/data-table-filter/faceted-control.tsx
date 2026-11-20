// Copyright 2026 Redpanda Data, Inc.

import { Button as ButtonPrimitive } from '@base-ui/react/button';
import type { BadgeEmphasis, BadgeTone } from '../badge';
import { badgeVariants } from '../badge/variants';
import { cn } from '../../lib/utils';

type FacetedControlProps = Omit<ButtonPrimitive.Props, 'className' | 'style' | 'render' | 'nativeButton' | 'type'> & {
  kind: 'add' | 'clear' | 'segment' | 'remove';
  tone?: BadgeTone | undefined;
  variant?: BadgeEmphasis | undefined;
};

/** Native filter actions own their pill/segment recipe rather than repainting the general Button. */
export function FacetedControl({ kind, tone = 'primary', variant = 'subtle', ...props }: FacetedControlProps) {
  const isPill = kind === 'add' || kind === 'clear';
  return (
    <ButtonPrimitive
      {...props}
      className={cn(
        'cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
        isPill
          ? cn(badgeVariants({ tone, variant, disabled: props.disabled }), 'px-2 has-[>svg]:px-2')
          : 'm-0 inline-flex h-full shrink-0 items-center justify-center gap-2 rounded-none border-0 bg-transparent px-2 py-0 text-body-sm font-semibold whitespace-nowrap text-current transition-[color,background-color,border-color,box-shadow,scale] hover:bg-secondary-wash focus-visible:ring-inset active:bg-secondary-wash-pressed motion-reduce:transition-none [&_svg]:size-4',
        kind === 'remove' ? 'w-7 rounded-r-2xl px-0' : undefined
      )}
      data-faceted-control={kind}
      type="button"
    />
  );
}
