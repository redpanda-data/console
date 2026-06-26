import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

// biome-ignore lint/nursery/noDeprecatedImports: BadgeVariant is intentionally re-exposed so the overflow badge keeps accepting deprecated flat strings for back-compat.
import type { BadgeEmphasis, BadgeSize, BadgeTone, BadgeVariant } from './badge';
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
  /** Semantic color (tone) for the overflow badge */
  tone?: BadgeTone;
  /** Emphasis for the overflow badge. Deprecated flat variant strings are still accepted. */
  variant?: BadgeEmphasis | BadgeVariant;
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
      tone,
      variant = 'subtle',
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
      <Badge size={size} tone={tone} variant={variant}>
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
                {/* Render a real <button> as the trigger: Base UI's Trigger defaults to
                    nativeButton=true, so a non-button child (a <span>) makes it warn and
                    drop native button semantics. A <button> keeps semantics and makes the
                    overflow badge keyboard-focusable, opening the tooltip on focus and not
                    just hover. */}
                <TooltipTrigger
                  render={
                    <button
                      aria-label={`Show ${overflowChildren.length} more`}
                      className="inline-flex cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      type="button"
                    >
                      {overflowBadge}
                    </button>
                  }
                />
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
