import type React from 'react';
import { CountDot, type CountDotSize } from './count-dot';
import { StatusDot } from './status-dot';
import { hasSlotContent } from '../lib/has-slot-content';
import { requireUniqueItemIds } from '../lib/identified-items';
import { cn, type DotSize, type SemanticVariant, type SharedProps } from '../lib/utils';
import { dotGroupPositionVariants, dotGroupSpacingVariants } from './dot-group/variants';

type DotGroupPosition = 'top' | 'top-right' | 'top-left' | 'right' | 'bottom-right' | 'bottom' | 'bottom-left' | 'left';

interface DotGroupStatusItem {
  id: string;
  kind: 'status';
  label?: string | undefined;
  pulsing?: boolean | undefined;
  variant?: SemanticVariant | undefined;
}

interface DotGroupCountItem {
  count: number;
  id: string;
  kind: 'count';
  label?: string | undefined;
  max?: number | undefined;
  variant?: SemanticVariant | undefined;
}

type DotGroupItem = DotGroupStatusItem | DotGroupCountItem;

type DotGroupProps = Omit<React.ComponentProps<'div'>, 'content' | 'children'> &
  SharedProps & {
    content?: React.ReactNode | undefined;
    position?: DotGroupPosition | undefined;
    maxVisible?: number | undefined;
  } & (
    | { items: readonly DotGroupStatusItem[]; size?: DotSize | undefined }
    | { items: readonly DotGroupItem[]; size?: CountDotSize | undefined }
  );

function renderDot(item: DotGroupItem, size: DotSize, index: number) {
  const style: React.CSSProperties & { '--dot-group-index': number } = { '--dot-group-index': index };
  if (item.kind === 'count') {
    if (size === 'xxs' || size === 'xs') {
      throw new RangeError('Count indicators require a DotGroup size of sm, md, or lg.');
    }
    return (
      <CountDot
        aria-label={item.label}
        className="z-(--dot-group-index)"
        count={item.count}
        key={item.id}
        max={item.max}
        role={item.label === undefined ? undefined : 'img'}
        size={size}
        stacked
        style={style}
        variant={item.variant}
      />
    );
  }
  return (
    <StatusDot
      aria-label={item.label}
      className="z-(--dot-group-index)"
      key={item.id}
      pulsing={item.pulsing}
      role={item.label === undefined ? undefined : 'img'}
      size={size}
      stacked
      style={style}
      variant={item.variant}
    />
  );
}

const overflowIconSize: Record<DotSize, { size: number; stroke: number }> = {
  xxs: { size: 8, stroke: 1.5 },
  xs: { size: 12, stroke: 1.5 },
  sm: { size: 16, stroke: 2 },
  md: { size: 20, stroke: 2 },
  lg: { size: 24, stroke: 2.5 },
};

function DotGroupOverflow({ size, zIndex }: { size: DotSize; zIndex: number }) {
  const { size: s, stroke } = overflowIconSize[size];
  const pad = s * 0.25;
  const stackingStyle: React.CSSProperties & { '--dot-group-overflow-index': number } = {
    '--dot-group-overflow-index': zIndex,
  };
  return (
    <svg
      aria-hidden="true"
      className="z-(--dot-group-overflow-index) shrink-0 text-secondary drop-shadow-[0_0_2px_var(--color-background)]"
      height={s}
      style={stackingStyle}
      viewBox={`0 0 ${s} ${s}`}
      width={s}
    >
      <line
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={stroke}
        x1={s / 2}
        x2={s / 2}
        y1={pad}
        y2={s - pad}
      />
      <line
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={stroke}
        x1={pad}
        x2={s - pad}
        y1={s / 2}
        y2={s / 2}
      />
    </svg>
  );
}

function DotGroup({
  size = 'md',
  content,
  position = 'top-right',
  maxVisible,
  className,
  testId,
  items,
  ...props
}: DotGroupProps) {
  requireUniqueItemIds(items);
  if (maxVisible !== undefined && (!Number.isInteger(maxVisible) || maxVisible < 0)) {
    throw new RangeError('DotGroup maxVisible must be a nonnegative integer.');
  }
  const visibleItems = maxVisible === undefined ? items : items.slice(0, maxVisible);
  const overflowCount = items.length - visibleItems.length;

  const dots = (
    <div
      className={cn(
        dotGroupSpacingVariants({ size }),
        hasSlotContent(content) && dotGroupPositionVariants({ position }),
        !hasSlotContent(content) && className
      )}
      data-slot="dot-group"
      data-testid={hasSlotContent(content) ? undefined : testId}
      {...(hasSlotContent(content) ? {} : props)}
    >
      {visibleItems.map((item, index) => renderDot(item, size, index))}
      {overflowCount > 0 ? <DotGroupOverflow size={size} zIndex={visibleItems.length} /> : null}
    </div>
  );

  if (hasSlotContent(content)) {
    return (
      // `w-fit` as in StatusDot: the dots are positioned against this wrapper, so one
      // stretched by its parent moves them off the content's corner.
      <div
        className={cn('relative inline-flex w-fit', className)}
        data-slot="dot-group"
        data-testid={testId}
        {...props}
      >
        {content}
        {dots}
      </div>
    );
  }

  return dots;
}

export {
  DotGroup,
  type DotGroupCountItem,
  type DotGroupItem,
  type DotGroupPosition,
  type DotGroupProps,
  type DotGroupStatusItem,
};
