import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

// biome-ignore lint/nursery/noDeprecatedImports: BadgeVariant is intentionally re-exposed so the overflow badge keeps accepting deprecated flat strings for back-compat.
import type { BadgeEmphasis, BadgeProps, BadgeSize, BadgeTone, BadgeVariant } from './badge';
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
      maxVisible = 3,
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
                {/* A real <button>, for two reasons: Base UI's Trigger defaults to
                    nativeButton=true, so a non-button child warns and drops native button
                    semantics — which is also what makes the badge keyboard-focusable, opening
                    the tooltip on focus and not just hover. The Badge *is* that button rather
                    than sitting inside one, because Badge scopes its hover to `:is(a, button)`:
                    nested, the selector never matches and the one interactive badge in the
                    group becomes the only one that doesn't react. */}
                <TooltipTrigger
                  render={overflowBadge({
                    className: 'cursor-pointer appearance-none',
                    render: <button aria-label={`Show ${overflowChildren.length} more`} type="button" />,
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
  }
);

BadgeGroup.displayName = 'BadgeGroup';

export { BadgeGroup, badgeGroupVariants };
