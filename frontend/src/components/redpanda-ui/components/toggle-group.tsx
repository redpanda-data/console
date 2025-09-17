'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { AnimatePresence, type HTMLMotionProps, motion, type Transition } from 'motion/react';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import React from 'react';

import { cn } from '../lib/utils';

const toggleVariants = cva(
  "cursor-pointer inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium hover:bg-muted hover:text-muted-foreground transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none focus:outline-none aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap",
  {
    variants: {
      type: {
        single: '',
        multiple: 'data-[state=on]:bg-accent',
      },
      variant: {
        default: 'bg-transparent',
        outline: 'border border-input bg-transparent shadow-xs hover:bg-muted hover:text-muted-foreground',
      },
      size: {
        default: 'h-9 px-2 min-w-9',
        sm: 'h-8 px-1.5 min-w-8',
        lg: 'h-10 px-2.5 min-w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type ToggleGroupContextProps = VariantProps<typeof toggleVariants> & {
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
  Omit<VariantProps<typeof toggleVariants>, 'type'> & {
    transition?: Transition;
    activeClassName?: string;
    testId?: string;
  };

function ToggleGroup({
  className,
  variant,
  size,
  children,
  transition = { type: 'spring', bounce: 0, stiffness: 200, damping: 25 },
  activeClassName,
  testId,
  ...props
}: ToggleGroupProps) {
  const globalId = React.useId();

  return (
    <ToggleGroupContext.Provider
      value={{
        variant,
        size,
        type: props.type,
        transition,
        activeClassName,
        globalId,
      }}
    >
      <ToggleGroupPrimitive.Root
        data-slot="toggle-group"
        data-testid={testId}
        className={cn('flex items-center justify-center gap-1 relative', className)}
        {...props}
      >
        {children}
      </ToggleGroupPrimitive.Root>
    </ToggleGroupContext.Provider>
  );
}

type ToggleGroupItemProps = React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  Omit<VariantProps<typeof toggleVariants>, 'type'> & {
    children?: React.ReactNode;
    buttonProps?: HTMLMotionProps<'button'>;
    spanProps?: React.ComponentProps<'span'>;
    testId?: string;
  };

const ToggleGroupItem = React.forwardRef<HTMLButtonElement, ToggleGroupItemProps>(
  ({ className, children, variant, size, buttonProps, spanProps, testId, ...props }, ref) => {
    const {
      activeClassName,
      transition,
      type,
      variant: contextVariant,
      size: contextSize,
      globalId,
    } = useToggleGroup();
    const itemRef = React.useRef<HTMLButtonElement>(null);
    React.useImperativeHandle(ref, () => itemRef.current || document.createElement('button'));
    const [isActive, setIsActive] = React.useState(false);

    React.useEffect(() => {
      const node = itemRef.current;
      if (!node) return;
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

    return (
      <ToggleGroupPrimitive.Item ref={itemRef} {...props} asChild>
        <motion.button
          data-slot="toggle-group-item"
          data-testid={testId}
          initial={{ scale: 1 }}
          whileTap={{ scale: 0.9 }}
          {...buttonProps}
          className={cn('relative', buttonProps?.className)}
        >
          <span
            {...spanProps}
            data-state={isActive ? 'on' : 'off'}
            className={cn(
              'relative z-[1]',
              toggleVariants({
                variant: variant || contextVariant,
                size: size || contextSize,
                type,
              }),
              className,
              spanProps?.className,
            )}
          >
            {children}
          </span>

          <AnimatePresence initial={false}>
            {isActive && type === 'single' && (
              <motion.span
                layoutId={`active-toggle-group-item-${globalId}`}
                data-slot="active-toggle-group-item"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition}
                className={cn('absolute inset-0 z-0 rounded-md bg-accent', activeClassName)}
              />
            )}
          </AnimatePresence>
        </motion.button>
      </ToggleGroupPrimitive.Item>
    );
  },
);

ToggleGroupItem.displayName = 'ToggleGroupItem';

export { ToggleGroup, ToggleGroupItem, type ToggleGroupProps, type ToggleGroupItemProps };
