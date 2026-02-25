import { cva } from 'class-variance-authority';
import React from 'react';

import { cn, type DotSize, type SharedProps } from '../lib/utils';

type DotGroupPosition = 'top' | 'top-right' | 'top-left' | 'right' | 'bottom-right' | 'bottom' | 'bottom-left' | 'left';

type DotGroupProps = Omit<React.ComponentProps<'div'>, 'content'> &
  SharedProps & {
    size?: DotSize;
    content?: React.ReactNode;
    position?: DotGroupPosition;
    maxVisible?: number;
  };

const dotGroupSpacingVariants = cva('inline-flex items-center', {
  variants: {
    size: {
      xxs: '-space-x-px',
      xs: '-space-x-px',
      sm: '-space-x-px',
      md: '-space-x-0.5',
      lg: '-space-x-0.5',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

const dotGroupPositionVariants = cva('absolute', {
  variants: {
    position: {
      top: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2',
      'top-right': 'top-0 right-0 translate-x-1/3 -translate-y-1/2',
      'top-left': 'top-0 left-0 -translate-x-1/3 -translate-y-1/2',
      right: 'top-1/2 left-full -translate-y-1/2',
      'bottom-right': 'right-0 bottom-0 translate-x-1/3 translate-y-1/2',
      bottom: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2',
      'bottom-left': 'bottom-0 left-0 -translate-x-1/3 translate-y-1/2',
      left: 'top-1/2 right-full -translate-y-1/2',
    },
  },
  defaultVariants: {
    position: 'top-right',
  },
});

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
  return (
    <svg
      aria-hidden="true"
      className="shrink-0 text-secondary drop-shadow-[0_0_2px_var(--color-background)]"
      height={s}
      style={{ zIndex }}
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
  children,
  ...props
}: DotGroupProps) {
  const childArray = React.Children.toArray(children).filter(React.isValidElement);
  const visibleChildren = maxVisible !== undefined ? childArray.slice(0, maxVisible) : childArray;
  const overflowCount = maxVisible !== undefined ? childArray.length - visibleChildren.length : 0;

  const dots = (
    <div
      className={cn(
        dotGroupSpacingVariants({ size }),
        content && dotGroupPositionVariants({ position }),
        !content && className
      )}
      data-slot="dot-group"
      data-testid={content ? undefined : testId}
      {...(content ? {} : props)}
    >
      {visibleChildren.map((child, index) => {
        if (!React.isValidElement<{ stacked?: boolean; size?: DotSize; style?: React.CSSProperties }>(child)) {
          return child;
        }
        return React.cloneElement(child, {
          stacked: true,
          size,
          style: { ...child.props.style, zIndex: index },
        });
      })}
      {overflowCount > 0 ? <DotGroupOverflow size={size} zIndex={visibleChildren.length} /> : null}
    </div>
  );

  if (content) {
    return (
      <div className={cn('relative inline-flex', className)} data-slot="dot-group" data-testid={testId} {...props}>
        {content}
        {dots}
      </div>
    );
  }

  return dots;
}

export { DotGroup, dotGroupSpacingVariants, dotGroupPositionVariants, type DotGroupProps, type DotGroupPosition };
