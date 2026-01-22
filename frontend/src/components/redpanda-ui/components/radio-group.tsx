import { Circle } from 'lucide-react';
import { AnimatePresence, type HTMLMotionProps, motion, type Transition } from 'motion/react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

type RadioGroupProps = React.ComponentProps<typeof RadioGroupPrimitive.Root> &
  SharedProps & {
    transition?: Transition;
  };

function RadioGroup({ className, orientation = 'vertical', testId, ...props }: RadioGroupProps) {
  return (
    <RadioGroupPrimitive.Root
      className={cn('grid gap-2.5', orientation === 'horizontal' && 'grid-cols-2', className)}
      data-slot="radio-group"
      data-testid={testId}
      {...props}
    />
  );
}

type RadioGroupIndicatorProps = React.ComponentProps<typeof RadioGroupPrimitive.Indicator> & {
  transition: Transition;
};

function RadioGroupIndicator({ className, transition, ...props }: RadioGroupIndicatorProps) {
  return (
    <RadioGroupPrimitive.Indicator
      className={cn('-mt-[3px] flex items-center justify-center', className)}
      data-slot="radio-group-indicator"
      {...props}
    >
      <AnimatePresence>
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          data-slot="radio-group-indicator-circle"
          exit={{ opacity: 0, scale: 0 }}
          initial={{ opacity: 0, scale: 0 }}
          key="radio-group-indicator-circle"
          transition={transition}
        >
          <Circle className="size-3 fill-current text-current" />
        </motion.div>
      </AnimatePresence>
    </RadioGroupPrimitive.Indicator>
  );
}

type RadioGroupItemProps = React.ComponentProps<typeof RadioGroupPrimitive.Item> &
  HTMLMotionProps<'button'> &
  SharedProps & {
    transition?: Transition;
  };

function RadioGroupItem({
  className,
  transition = { type: 'spring', stiffness: 200, damping: 16 },
  testId,
  ...props
}: RadioGroupItemProps) {
  return (
    <RadioGroupPrimitive.Item asChild {...props}>
      <motion.button
        className={cn(
          '!border-input flex aspect-square size-5 items-center justify-center rounded-full border text-selected ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        data-slot="radio-group-item"
        data-testid={testId}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        {...props}
      >
        <RadioGroupIndicator data-slot="radio-group-item-indicator" transition={transition} />
      </motion.button>
    </RadioGroupPrimitive.Item>
  );
}

export {
  RadioGroup,
  RadioGroupItem,
  RadioGroupIndicator,
  type RadioGroupProps,
  type RadioGroupItemProps,
  type RadioGroupIndicatorProps,
};
