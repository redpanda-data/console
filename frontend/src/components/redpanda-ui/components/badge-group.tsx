import { cva, type VariantProps } from 'class-variance-authority';
import { Button as ConsoleButton } from 'components/redpanda-ui/components/button';
import React from 'react';

import type { BadgeEmphasis, BadgeProps, BadgeSize, BadgeTone } from './badge';
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
  /** Custom render function for overflow tooltip content. Receives the overflow children as an array. If omitted, no tooltip is rendered. */
  renderOverflowContent?: (overflowChildren: React.ReactNode[]) => React.ReactNode;
  /** Size of the overflow badge */
  size?: BadgeSize;
  /** Semantic color (tone) for the overflow badge */
  tone?: BadgeTone;
  /** Emphasis for the overflow badge. */
  variant?: BadgeEmphasis;
}

const BadgeGroup = ({
  className,
  gap,
  wrap,
  testId,
  children,
  maxVisible = 3,
  size = 'sm',
  tone,
  variant = 'subtle',
  renderOverflowContent,
  ref,
  ...props
}: BadgeGroupProps & { ref?: React.Ref<HTMLDivElement> }) => {
  const childArray = React.Children.toArray(children);
  const visibleChildren = childArray.slice(0, maxVisible);
  const overflowChildren = childArray.slice(maxVisible);
  const hasOverflow = overflowChildren.length > 0;

  /** `+N`, as a plain chip or — given `render` — as the tooltip's trigger. */
  const overflowBadge = (overrides?: Partial<BadgeProps>) => (
    <Badge size={size} tone={tone} variant={variant} {...overrides}>
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
              <TooltipTrigger
                render={overflowBadge({
                  className: 'cursor-pointer appearance-none',
                  render: (
                    <ConsoleButton
                      aria-label={`Show ${overflowChildren.length} more`}
                      type="button"
                      variant="unstyled"
                    />
                  ),
                })}
              />
              <TooltipContent>{renderOverflowContent(overflowChildren)}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          overflowBadge()
        ))}
    </div>
  );
};

BadgeGroup.displayName = 'BadgeGroup';

export { BadgeGroup, badgeGroupVariants };
