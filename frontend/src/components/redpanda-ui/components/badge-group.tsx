/**
 * BadgeGroup Component
 *
 * A controlled design system component for displaying a group of badges with overflow handling.
 * Shows a configurable number of visible badges, with overflow items shown in a tooltip.
 */

import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import type { BadgeVariant } from './badge';
import { Badge } from './badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { cn, type SharedProps } from '../lib/utils';

const badgeGroupVariants = cva('flex items-center', {
  variants: {
    gap: {
      none: '',
      xs: 'gap-0.5',
      sm: 'gap-1',
      md: 'gap-1.5',
      lg: 'gap-2',
    },
    wrap: {
      true: 'flex-wrap',
      false: '',
    },
  },
  defaultVariants: {
    gap: 'sm',
    wrap: false,
  },
});

/** Individual badge item configuration */
export type BadgeItem = {
  /** Unique key for the badge */
  key: string;
  /** Display label for the badge */
  label: string;
  /** Optional icon to display before the label */
  icon?: React.ReactNode;
  /** Badge variant for styling */
  variant?: BadgeVariant;
};

export interface BadgeGroupProps
  extends Omit<React.ComponentProps<'div'>, 'children'>,
    VariantProps<typeof badgeGroupVariants>,
    SharedProps {
  /** Array of badge items to display */
  items: BadgeItem[];
  /** Maximum number of badges to show before overflow (default: 3) */
  maxVisible?: number;
  /** Size of the badges */
  badgeSize?: 'sm' | 'md' | 'lg';
  /** Default variant for badges without explicit variant */
  defaultVariant?: BadgeVariant;
  /** Variant for the overflow badge */
  overflowVariant?: BadgeVariant;
  /** Custom render function for overflow tooltip content */
  renderOverflowContent?: (overflowItems: BadgeItem[]) => React.ReactNode;
}

const BadgeGroup = React.forwardRef<HTMLDivElement, BadgeGroupProps>(
  (
    {
      className,
      gap,
      wrap,
      testId,
      items,
      maxVisible = 3,
      badgeSize = 'sm',
      defaultVariant = 'neutral-inverted',
      overflowVariant = 'neutral-inverted',
      renderOverflowContent,
      ...props
    },
    ref
  ) => {
    const visibleItems = items.slice(0, maxVisible);
    const overflowItems = items.slice(maxVisible);
    const hasOverflow = overflowItems.length > 0;

    const defaultOverflowContent = (overflow: BadgeItem[]) => (
      <span>{overflow.map((item) => item.label).join(', ')}</span>
    );

    return (
      <div
        className={cn(badgeGroupVariants({ gap, wrap }), className)}
        data-slot="badge-group"
        data-testid={testId}
        ref={ref}
        {...props}
      >
        {visibleItems.map((item) => (
          <Badge icon={item.icon} key={item.key} size={badgeSize} variant={item.variant ?? defaultVariant}>
            {item.label}
          </Badge>
        ))}

        {hasOverflow === true && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Badge className="cursor-default" size={badgeSize} variant={overflowVariant}>
                    +{overflowItems.length}
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {renderOverflowContent ? renderOverflowContent(overflowItems) : defaultOverflowContent(overflowItems)}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    );
  }
);

BadgeGroup.displayName = 'BadgeGroup';

export { BadgeGroup, badgeGroupVariants };
