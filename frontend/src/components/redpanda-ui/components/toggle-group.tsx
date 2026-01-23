'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { AnimatePresence, type HTMLMotionProps, motion, type Transition } from 'motion/react';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
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

type ToggleGroupProps = React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  Omit<VariantProps<typeof toggleVariants>, 'type'> &
  SharedProps & {
    transition?: Transition;
    activeClassName?: string;
    attached?: boolean;
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
  ...props
}: ToggleGroupProps) {
  const globalId = React.useId();

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
          type: props.type,
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
    <ToggleGroupPrimitive.Root
      className={cn(
        'relative flex items-center justify-center',
        variant === 'outline' && '!border-outline-inverse rounded-md border p-0.5',
        !attached && 'gap-1',
        className
      )}
      data-slot="toggle-group"
      data-testid={testId}
      {...props}
    >
      {content}
    </ToggleGroupPrimitive.Root>
  );
}

type ToggleGroupItemProps = React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  Omit<VariantProps<typeof toggleVariants>, 'type'> &
  SharedProps & {
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

    return (
      <ToggleGroupPrimitive.Item disabled={disabled} ref={itemRef} {...props} asChild>
        <motion.button
          data-slot="toggle-group-item"
          data-testid={testId}
          disabled={disabled}
          initial={{ scale: 1 }}
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
      </ToggleGroupPrimitive.Item>
    );
  }
);

ToggleGroupItem.displayName = 'ToggleGroupItem';

export { ToggleGroup, ToggleGroupItem, type ToggleGroupProps, type ToggleGroupItemProps };
