import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import type { BadgeSize, BadgeVariant } from './badge';
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

export interface BadgeGroupProps
  extends React.ComponentProps<'div'>,
    VariantProps<typeof badgeGroupVariants>,
    SharedProps {
  /** Maximum number of children to show before overflow (default: 3) */
  maxVisible?: number;
  /** Size of the overflow badge */
  size?: BadgeSize;
  /** Variant for the overflow badge */
  variant?: BadgeVariant;
  /** Custom render function for overflow tooltip content. Receives the overflow children as an array. If omitted, no tooltip is rendered. */
  renderOverflowContent?: (overflowChildren: React.ReactNode[]) => React.ReactNode;
}

const BadgeGroup = React.forwardRef<HTMLDivElement, BadgeGroupProps>(
  (
    {
      className,
      gap,
      wrap,
      testId,
      children,
      maxVisible,
      size = 'sm',
      variant = 'neutral-inverted',
      renderOverflowContent,
      ...props
    },
    ref
  ) => {
    const childArray = React.Children.toArray(children);
    const visibleChildren = childArray.slice(0, maxVisible);
    const overflowChildren = childArray.slice(maxVisible);
    const hasOverflow = overflowChildren.length > 0;

    const overflowBadge = (
      <Badge size={size} variant={variant}>
        +{overflowChildren.length}
      </Badge>
    );

    return (
      <div
        className={cn(badgeGroupVariants({ gap, wrap }), className)}
        data-slot="badge-group"
        data-testid={testId}
        ref={ref}
        {...props}
      >
        {visibleChildren}

        {hasOverflow === true &&
          (renderOverflowContent ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex cursor-pointer">{overflowBadge}</span>
                </TooltipTrigger>
                <TooltipContent>{renderOverflowContent(overflowChildren)}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            overflowBadge
          ))}
      </div>
    );
  }
);

BadgeGroup.displayName = 'BadgeGroup';

export { BadgeGroup, badgeGroupVariants };
