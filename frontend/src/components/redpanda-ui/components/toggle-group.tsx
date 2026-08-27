// Copyright 2026 Redpanda Data, Inc.

'use client';

import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group';
import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import type { GroupContextValue, GroupPosition } from './group';
import { cn, type SharedProps } from '../lib/utils';

type Orientation = 'horizontal' | 'vertical';
/** Only the group's own box differs between the two; a segment reads it for its radius rung. */
type Variant = 'default' | 'outline';

/**
 * A segment is transparent at rest, so it tints in when unselected and steps the `selected` fill when
 * chosen — archetypes B and A of docs/(foundation)/interaction-states.mdx. Hover is scoped to
 * `not-data-pressed`, so the chosen segment steps its own ramp instead of taking a wash on top of it.
 */
const toggleVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap bg-transparent font-medium text-body outline-none transition-[color,background-color,border-color,box-shadow] hover:not-data-pressed:bg-accent hover:not-data-pressed:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 active:not-data-pressed:bg-accent-pressed disabled:pointer-events-none disabled:opacity-50 data-pressed:bg-selected data-pressed:text-selected-foreground data-pressed:active:bg-selected-pressed data-pressed:hover:bg-selected-hover motion-reduce:transition-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      size: {
        sm: 'h-8 min-w-8 px-1.5',
        md: 'h-9 min-w-9 px-2',
        lg: 'h-10 min-w-10 px-2.5',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

/** Spelled out one class at a time, because Tailwind only sees literal names. */
const RADIUS = {
  md: {
    all: 'rounded-md',
    top: 'rounded-t-md rounded-b-none',
    bottom: 'rounded-b-md rounded-t-none',
    start: 'rounded-r-none rounded-l-md',
    end: 'rounded-r-md rounded-l-none',
  },
  sm: {
    all: 'rounded-sm',
    top: 'rounded-t-sm rounded-b-none',
    bottom: 'rounded-b-sm rounded-t-none',
    start: 'rounded-r-none rounded-l-sm',
    end: 'rounded-r-sm rounded-l-none',
  },
} as const;

/** A segment inside the `outline` track sits 2px in from it, so it takes the rung below — as Tabs does. */
function getRadiusClasses(
  attached: boolean,
  position: GroupPosition | undefined,
  orientation: Orientation,
  variant: Variant | undefined
): string {
  const rung = RADIUS[variant === 'outline' ? 'sm' : 'md'];
  if (!(attached && position)) {
    return rung.all;
  }
  if (position === 'middle') {
    return 'rounded-none';
  }
  if (orientation === 'vertical') {
    return position === 'first' ? rung.top : rung.bottom;
  }
  return position === 'first' ? rung.start : rung.end;
}

type ToggleGroupContextProps = VariantProps<typeof toggleVariants> &
  GroupContextValue & {
    disabled?: boolean;
    orientation: Orientation;
    variant?: Variant;
  };

const ToggleGroupContext = React.createContext<ToggleGroupContextProps | undefined>(undefined);

const useToggleGroup = (): ToggleGroupContextProps => {
  const context = React.useContext(ToggleGroupContext);
  if (!context) {
    throw new Error('useToggleGroup must be used within a ToggleGroup');
  }
  return context;
};

type ToggleGroupProps = Omit<React.ComponentProps<typeof ToggleGroupPrimitive>, 'value' | 'defaultValue'> &
  VariantProps<typeof toggleVariants> &
  SharedProps & {
    variant?: Variant;
    attached?: boolean;
    value?: string[];
    defaultValue?: string[];
  };

function ToggleGroup({
  className,
  variant,
  size,
  children,
  testId,
  attached = true,
  disabled,
  orientation = 'horizontal',
  ...props
}: ToggleGroupProps) {
  const isVertical = orientation === 'vertical';
  const segments = React.Children.toArray(children).filter(React.isValidElement);

  const positionOf = (index: number): GroupPosition | undefined => {
    if (!attached || segments.length === 1) {
      return;
    }
    if (index === 0) {
      return 'first';
    }
    return index === segments.length - 1 ? 'last' : 'middle';
  };

  return (
    <ToggleGroupPrimitive
      className={cn(
        'flex items-center justify-center',
        isVertical && 'flex-col',
        isVertical && attached && 'items-stretch',
        variant === 'outline' && '!border-border rounded-md border p-0.5',
        !attached && 'gap-1',
        className
      )}
      data-attached={attached || undefined}
      data-slot="toggle-group"
      data-testid={testId}
      data-variant={variant}
      disabled={disabled}
      orientation={orientation}
      {...props}
    >
      {segments.map((segment, index) => (
        <ToggleGroupContext.Provider
          key={segment.key}
          value={{ variant, size, attached, disabled, position: positionOf(index), orientation }}
        >
          {segment}
        </ToggleGroupContext.Provider>
      ))}
    </ToggleGroupPrimitive>
  );
}

type ToggleGroupItemProps = Omit<React.ComponentProps<typeof TogglePrimitive>, 'onPressedChange'> &
  VariantProps<typeof toggleVariants> &
  SharedProps & {
    variant?: Variant;
    value: string;
  };

function ToggleGroupItem({ className, disabled, variant, size, testId, value, ...props }: ToggleGroupItemProps) {
  const group = useToggleGroup();
  const resolvedDisabled = disabled ?? group.disabled;
  const resolvedVariant = variant ?? group.variant;

  return (
    <TogglePrimitive
      className={cn(
        toggleVariants({ size: size ?? group.size }),
        getRadiusClasses(group.attached, group.position, group.orientation, resolvedVariant),
        group.orientation === 'vertical' && group.attached && 'w-full',
        className
      )}
      data-slot="toggle-group-item"
      data-testid={testId}
      disabled={resolvedDisabled}
      value={value}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem, type ToggleGroupProps, type ToggleGroupItemProps };
