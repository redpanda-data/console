'use client';

import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group';
import { cva, type VariantProps } from 'class-variance-authority';
import { AnimatePresence, type HTMLMotionProps, motion, type Transition } from 'motion/react';
import React from 'react';

import type { GroupContextValue, GroupPosition } from './group';
import { cn, type SharedProps } from '../lib/utils';

type Orientation = 'horizontal' | 'vertical';

type HighlightBounds = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const toggleVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-[color,box-shadow] hover:bg-muted hover:text-muted-foreground focus:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 group-data-[pressed]/toggle-group-item:bg-primary-alpha-strong group-data-[pressed]/toggle-group-item:text-action-primary dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: 'bg-transparent hover:bg-muted hover:text-muted-foreground',
      },
      size: {
        default: 'h-9 min-w-9 px-2',
        sm: 'h-8 min-w-8 px-1.5',
        lg: 'h-10 min-w-10 px-2.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function getPositionClasses(attached: boolean, position: GroupPosition | undefined, orientation: Orientation): string {
  if (!(attached && position)) {
    return 'rounded-md';
  }
  if (orientation === 'vertical') {
    if (position === 'first') {
      return 'rounded-t-md rounded-b-none';
    }
    if (position === 'last') {
      return 'rounded-b-md rounded-t-none';
    }
    return 'rounded-none';
  }
  if (position === 'first') {
    return 'rounded-r-none rounded-l-md';
  }
  if (position === 'last') {
    return 'rounded-r-md rounded-l-none';
  }
  return 'rounded-none';
}

type RegisterItem = (value: string, el: HTMLButtonElement | null) => void;

type ToggleGroupContextProps = VariantProps<typeof toggleVariants> &
  GroupContextValue & {
    orientation: Orientation;
    registerItem: RegisterItem;
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
    transition?: Transition;
    activeClassName?: string;
    attached?: boolean;
    value?: string[];
    defaultValue?: string[];
  };

function ToggleGroup({
  className,
  variant,
  size,
  children,
  transition = { type: 'spring', bounce: 0, stiffness: 200, damping: 25 },
  activeClassName,
  testId,
  attached = true,
  multiple = false,
  value,
  defaultValue,
  orientation = 'horizontal',
  ...props
}: ToggleGroupProps) {
  const isHorizontal = orientation !== 'vertical';

  const childrenArray = React.Children.toArray(children).filter((child) => React.isValidElement(child));
  const childCount = childrenArray.length;

  const groupRef = React.useRef<HTMLDivElement>(null);
  const itemsRef = React.useRef<Map<string, HTMLButtonElement>>(new Map());

  const registerItem = React.useCallback<RegisterItem>((itemValue, el) => {
    const map = itemsRef.current;
    if (el) {
      map.set(itemValue, el);
    } else {
      map.delete(itemValue);
    }
  }, []);

  // Anchored highlight is a single-selection affordance, so it only renders when `multiple` is false.
  const [internalValue, setInternalValue] = React.useState<string[]>(defaultValue ?? []);
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;
  const activeValue = multiple ? undefined : currentValue[0];

  const handleValueChange = React.useCallback(
    (groupValue: string[], eventDetails: ToggleGroupPrimitive.ChangeEventDetails) => {
      if (!isControlled) {
        setInternalValue(groupValue);
      }
      props.onValueChange?.(groupValue, eventDetails);
    },
    [isControlled, props.onValueChange]
  );

  const [bounds, setBounds] = React.useState<HighlightBounds | null>(null);

  // childCount is a dep so we re-measure when items are inserted/removed (reflow can shift the active item without resizing it).
  // biome-ignore lint/correctness/useExhaustiveDependencies: childCount is intentional
  React.useLayoutEffect(() => {
    if (multiple || !activeValue) {
      setBounds(null);
      return;
    }

    const measure = () => {
      const el = itemsRef.current.get(activeValue);
      if (!el) {
        setBounds(null);
        return;
      }
      setBounds((prev) => {
        const next = { top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight };
        if (
          prev &&
          prev.top === next.top &&
          prev.left === next.left &&
          prev.width === next.width &&
          prev.height === next.height
        ) {
          return prev;
        }
        return next;
      });
    };

    measure();

    const ro = new ResizeObserver(measure);
    if (groupRef.current) {
      ro.observe(groupRef.current);
    }
    const activeEl = itemsRef.current.get(activeValue);
    if (activeEl) {
      ro.observe(activeEl);
    }
    return () => ro.disconnect();
  }, [activeValue, multiple, childCount]);

  // Lock the perpendicular axis so surrounding layout shifts don't drag the highlight off-axis.
  const axisLockedTransition: Transition = React.useMemo(() => {
    const snap = { duration: 0 } as const;
    return isHorizontal ? { ...transition, top: snap, height: snap } : { ...transition, left: snap, width: snap };
  }, [transition, isHorizontal]);

  const getPosition = (index: number): GroupPosition | undefined => {
    if (!attached || childCount === 1) {
      return;
    }
    if (index === 0) {
      return 'first';
    }
    if (index === childCount - 1) {
      return 'last';
    }
    return 'middle';
  };

  const activeIndex = activeValue
    ? childrenArray.findIndex(
        (child) => React.isValidElement(child) && (child.props as { value?: unknown }).value === activeValue
      )
    : -1;
  const highlightPositionClasses = getPositionClasses(
    attached,
    activeIndex >= 0 ? getPosition(activeIndex) : undefined,
    orientation
  );

  return (
    <ToggleGroupPrimitive
      className={cn(
        'relative flex items-center justify-center',
        !isHorizontal && 'flex-col',
        !isHorizontal && attached && 'items-stretch',
        variant === 'outline' && '!border-outline-inverse rounded-md border p-0.5',
        !attached && 'gap-1',
        className
      )}
      data-attached={attached || undefined}
      data-slot="toggle-group"
      data-testid={testId}
      data-variant={variant}
      defaultValue={defaultValue}
      multiple={multiple}
      orientation={orientation}
      ref={groupRef}
      value={value}
      {...props}
      onValueChange={handleValueChange}
    >
      <AnimatePresence initial={false}>
        {!multiple && bounds ? (
          <motion.div
            animate={{ top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height, opacity: 1 }}
            aria-hidden
            className={cn('pointer-events-none absolute z-0 bg-accent', highlightPositionClasses, activeClassName)}
            data-slot="toggle-group-highlight"
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            initial={false}
            transition={axisLockedTransition}
          />
        ) : null}
      </AnimatePresence>
      {childrenArray.map((child, index) => {
        const element = child as React.ReactElement;
        return (
          <ToggleGroupContext.Provider
            key={element.key || `toggle-group-item-${index}`}
            value={{ variant, size, attached, position: getPosition(index), orientation, registerItem }}
          >
            {child}
          </ToggleGroupContext.Provider>
        );
      })}
    </ToggleGroupPrimitive>
  );
}

type ToggleGroupItemProps = Omit<React.ComponentProps<typeof TogglePrimitive>, 'onPressedChange'> &
  VariantProps<typeof toggleVariants> &
  SharedProps & {
    value: string;
    children?: React.ReactNode;
    buttonProps?: HTMLMotionProps<'button'>;
    spanProps?: React.ComponentProps<'span'>;
  };

const ToggleGroupItem = React.forwardRef<HTMLButtonElement, ToggleGroupItemProps>(
  ({ className, children, variant, size, buttonProps, spanProps, testId, disabled, value, ...props }, ref) => {
    const {
      variant: contextVariant,
      size: contextSize,
      attached,
      position,
      orientation,
      registerItem,
    } = useToggleGroup();

    const positionClasses = getPositionClasses(Boolean(attached), position, orientation);
    const isVerticalAttached = orientation === 'vertical' && Boolean(attached);

    // Combined ref: registers the node with the parent group (keyed by value) for highlight measurement, and forwards to the consumer's ref.
    const setRef = React.useCallback(
      (el: HTMLButtonElement | null) => {
        registerItem(value, el);
        if (typeof ref === 'function') {
          ref(el);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLButtonElement | null>).current = el;
        }
      },
      [registerItem, value, ref]
    );

    return (
      <TogglePrimitive
        disabled={disabled}
        value={value}
        {...props}
        // biome-ignore lint/suspicious/noExplicitAny: Base UI render merges Toggle attrs for the consumer element
        render={(rootProps: Record<string, any>, state: { pressed?: boolean; disabled?: boolean }) => (
          <motion.button
            {...rootProps}
            data-slot="toggle-group-item"
            data-testid={testId}
            disabled={disabled ?? state?.disabled}
            initial={{ scale: 1 }}
            ref={setRef}
            whileTap={{ scale: 0.9 }}
            {...buttonProps}
            className={cn('group/toggle-group-item relative', isVerticalAttached && 'w-full', buttonProps?.className)}
          >
            <span
              {...spanProps}
              className={cn(
                'relative z-[1]',
                toggleVariants({ variant: variant || contextVariant, size: size || contextSize }),
                positionClasses,
                isVerticalAttached && 'w-full',
                className,
                spanProps?.className
              )}
            >
              {children}
            </span>
          </motion.button>
        )}
      />
    );
  }
);

ToggleGroupItem.displayName = 'ToggleGroupItem';

export { ToggleGroup, ToggleGroupItem, type ToggleGroupProps, type ToggleGroupItemProps };
