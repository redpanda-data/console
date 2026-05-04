'use client';

import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group';
import { cva, type VariantProps } from 'class-variance-authority';
import { AnimatePresence, type HTMLMotionProps, motion, type Transition } from 'motion/react';
import React from 'react';

import type { GroupContextValue, GroupPosition } from './group';
import { cn, type SharedProps } from '../lib/utils';

const toggleVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-[color,box-shadow] hover:bg-muted hover:text-muted-foreground focus:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=on]:bg-primary-alpha-strong data-[state=on]:text-action-primary dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      type: {
        single: '',
        multiple: 'data-[state=on]:bg-primary-alpha-strong',
      },
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

type ToggleGroupContextProps = VariantProps<typeof toggleVariants> &
  GroupContextValue & {
    type?: 'single' | 'multiple';
    transition?: Transition;
    activeClassName?: string;
    globalId: string;
  };

const ToggleGroupContext = React.createContext<ToggleGroupContextProps | undefined>(undefined);

const useToggleGroup = (): ToggleGroupContextProps => {
  const context = React.useContext(ToggleGroupContext);
  if (!context) {
    throw new Error('useToggleGroup must be used within a ToggleGroup');
  }
  return context;
};

// Maps Radix's `type: 'single' | 'multiple'` to Base UI's `multiple: boolean`,
// and normalizes `value` to string for single / string[] for multiple.
type ToggleGroupBaseProps = Omit<
  React.ComponentProps<typeof ToggleGroupPrimitive>,
  'value' | 'defaultValue' | 'onValueChange' | 'multiple'
> &
  Omit<VariantProps<typeof toggleVariants>, 'type'> &
  SharedProps & {
    transition?: Transition;
    activeClassName?: string;
    attached?: boolean;
  };

type ToggleGroupSingleProps = ToggleGroupBaseProps & {
  type?: 'single';
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

type ToggleGroupMultipleProps = ToggleGroupBaseProps & {
  type: 'multiple';
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
};

type ToggleGroupProps = ToggleGroupSingleProps | ToggleGroupMultipleProps;

function toValueArray(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) {
    return;
  }
  return Array.isArray(v) ? v : [v];
}

function ToggleGroup({
  className,
  variant,
  size,
  children,
  transition = { type: 'spring', bounce: 0, stiffness: 200, damping: 25 },
  activeClassName,
  testId,
  attached = true,
  type,
  value,
  defaultValue,
  onValueChange,
  ...props
}: ToggleGroupProps) {
  const globalId = React.useId();
  const isMultiple = type === 'multiple';

  const arrayValue = toValueArray(value);
  const arrayDefaultValue = toValueArray(defaultValue);

  const handleValueChange = React.useMemo(() => {
    if (!onValueChange) {
      return;
    }
    return (groupValue: unknown[]) => {
      if (isMultiple) {
        (onValueChange as (next: string[]) => void)(groupValue as string[]);
      } else {
        (onValueChange as (next: string) => void)((groupValue[0] as string | undefined) ?? '');
      }
    };
  }, [isMultiple, onValueChange]);

  const childrenArray = React.Children.toArray(children).filter((child) => React.isValidElement(child));
  const childCount = childrenArray.length;

  const content = childrenArray.map((child, index) => {
    const getPosition = (): GroupPosition | undefined => {
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

    const position = getPosition();
    const element = child as React.ReactElement;
    const key = element.key || `toggle-group-item-${index}`;

    return (
      <ToggleGroupContext.Provider
        key={key}
        value={{
          variant,
          size,
          type,
          transition,
          activeClassName,
          globalId,
          attached,
          position,
        }}
      >
        {child}
      </ToggleGroupContext.Provider>
    );
  });

  return (
    <ToggleGroupPrimitive
      className={cn(
        'relative flex items-center justify-center',
        variant === 'outline' && '!border-outline-inverse rounded-md border p-0.5',
        !attached && 'gap-1',
        className
      )}
      data-slot="toggle-group"
      data-testid={testId}
      defaultValue={arrayDefaultValue}
      multiple={isMultiple}
      onValueChange={handleValueChange}
      // Restore Radix's "1 of N" radio-group semantics for single-select; Base UI's Toggle is a plain button.
      role={isMultiple ? undefined : 'radiogroup'}
      value={arrayValue}
      {...props}
    >
      {content}
    </ToggleGroupPrimitive>
  );
}

type ToggleGroupItemProps = Omit<React.ComponentProps<typeof TogglePrimitive>, 'onPressedChange'> &
  Omit<VariantProps<typeof toggleVariants>, 'type'> &
  SharedProps & {
    value: string;
    children?: React.ReactNode;
    buttonProps?: HTMLMotionProps<'button'>;
    spanProps?: React.ComponentProps<'span'>;
  };

const ToggleGroupItem = React.forwardRef<HTMLButtonElement, ToggleGroupItemProps>(
  ({ className, children, variant, size, buttonProps, spanProps, testId, disabled, ...props }, ref) => {
    const {
      activeClassName,
      transition,
      type,
      variant: contextVariant,
      size: contextSize,
      globalId,
      attached,
      position,
    } = useToggleGroup();
    const itemRef = React.useRef<HTMLButtonElement>(null);
    React.useImperativeHandle(ref, () => itemRef.current || document.createElement('button'));
    const [isActive, setIsActive] = React.useState(false);

    React.useEffect(() => {
      const node = itemRef.current;
      if (!node) {
        return;
      }
      const observer = new MutationObserver(() => {
        setIsActive(node.getAttribute('data-state') === 'on');
      });
      observer.observe(node, {
        attributes: true,
        attributeFilter: ['data-state'],
      });
      setIsActive(node.getAttribute('data-state') === 'on');
      return () => observer.disconnect();
    }, []);

    let positionClasses = 'rounded-md';
    if (attached && position === 'first') {
      positionClasses = 'rounded-r-none rounded-l-md';
    } else if (attached && position === 'last') {
      positionClasses = 'rounded-r-md rounded-l-none';
    } else if (attached && position === 'middle') {
      positionClasses = 'rounded-none';
    }

    const isSingle = type === 'single';
    return (
      <TogglePrimitive
        disabled={disabled}
        {...props}
        // biome-ignore lint/suspicious/noExplicitAny: Base UI render merges Toggle attrs for the consumer element
        render={(rootProps: Record<string, any>, state: { pressed?: boolean; disabled?: boolean }) => (
          <motion.button
            {...rootProps}
            aria-checked={isSingle ? Boolean(state?.pressed) : undefined}
            data-slot="toggle-group-item"
            data-state={state?.pressed ? 'on' : 'off'}
            data-testid={testId}
            disabled={disabled ?? state?.disabled}
            initial={{ scale: 1 }}
            ref={itemRef}
            role={isSingle ? 'radio' : undefined}
            whileTap={{ scale: 0.9 }}
            {...buttonProps}
            className={cn('relative', buttonProps?.className)}
          >
            <span
              {...spanProps}
              className={cn(
                'relative z-[1]',
                toggleVariants({
                  variant: variant || contextVariant,
                  size: size || contextSize,
                  type,
                }),
                positionClasses,
                className,
                spanProps?.className
              )}
              data-state={isActive ? 'on' : 'off'}
            >
              {children}
            </span>

            <AnimatePresence initial={false}>
              {isActive && type === 'single' && (
                <motion.span
                  animate={{ opacity: 1 }}
                  className={cn('absolute inset-0 z-0 bg-accent', positionClasses, activeClassName)}
                  data-slot="active-toggle-group-item"
                  exit={{ opacity: 0 }}
                  initial={{ opacity: 0 }}
                  layoutId={`active-toggle-group-item-${globalId}`}
                  transition={transition}
                />
              )}
            </AnimatePresence>
          </motion.button>
        )}
      />
    );
  }
);

ToggleGroupItem.displayName = 'ToggleGroupItem';

export { ToggleGroup, ToggleGroupItem, type ToggleGroupProps, type ToggleGroupItemProps };
