import type { VariantProps } from 'class-variance-authority';
import React from 'react';
import type { BadgeEmphasis, BadgeProps, BadgeSize, BadgeTone } from './badge';
import { Badge } from './badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { requireUniqueItemIds } from '../lib/identified-items';
import { cn, type SharedProps } from '../lib/utils';
import { badgeGroupVariants } from './badge-group/variants';

export interface BadgeGroupItem {
  content: React.ReactNode;
  id: string;
  /** Plain-text equivalent, also available when an item is hidden in overflow. */
  textValue: string;
}

export interface BadgeGroupProps<Item extends BadgeGroupItem = BadgeGroupItem>
  extends Omit<React.ComponentProps<'div'>, 'children'>,
    VariantProps<typeof badgeGroupVariants>,
    SharedProps {
  items: readonly Item[];
  /** Maximum number of items to show before overflow (default: 3). */
  maxVisible?: number | undefined;
  /** Receives the exact hidden items, including their caller-owned IDs. Omit for a passive overflow badge. */
  renderOverflowContent?: ((overflowItems: readonly Item[]) => React.ReactNode) | undefined;
  /** Size of the overflow badge */
  size?: BadgeSize | undefined;
  /** Semantic color (tone) for the overflow badge */
  tone?: BadgeTone | undefined;
  /** Emphasis for the overflow badge. */
  variant?: BadgeEmphasis | undefined;
}

function BadgeGroup<Item extends BadgeGroupItem>({
  className,
  gap,
  wrap,
  testId,
  items,
  maxVisible = 3,
  size = 'sm',
  tone,
  variant = 'subtle',
  renderOverflowContent,
  ref,
  ...props
}: BadgeGroupProps<Item> & { ref?: React.Ref<HTMLDivElement> | undefined }) {
  const descriptionId = React.useId();
  requireUniqueItemIds(items);
  for (const item of items) {
    if (typeof item.textValue !== 'string' || item.textValue.trim() === '') {
      throw new TypeError('BadgeGroup items require a nonempty textValue.');
    }
  }
  if (!Number.isInteger(maxVisible) || maxVisible < 0) {
    throw new RangeError('BadgeGroup maxVisible must be a nonnegative integer.');
  }
  const visibleItems = items.slice(0, maxVisible);
  const overflowItems = items.slice(maxVisible);
  const hasOverflow = overflowItems.length > 0;

  /** `+N`, as a plain chip or — given `render` — as the tooltip's trigger. */
  const overflowBadge = (overrides?: Partial<BadgeProps>) => (
    <Badge aria-describedby={descriptionId} size={size} tone={tone} variant={variant} {...overrides}>
      +{overflowItems.length}
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
      {visibleItems.map((item) => (
        <React.Fragment key={item.id}>{item.content}</React.Fragment>
      ))}
      {hasOverflow && (
        <span className="sr-only" id={descriptionId}>
          {overflowItems.map((item) => item.textValue).join(', ')}
        </span>
      )}

      {hasOverflow &&
        (renderOverflowContent === undefined ? (
          overflowBadge()
        ) : (
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
                  render: <button aria-label={`Show ${overflowItems.length} more`} type="button" />,
                })}
              />
              <TooltipContent>{renderOverflowContent(overflowItems)}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
    </div>
  );
}

BadgeGroup.displayName = 'BadgeGroup';

export { BadgeGroup };
