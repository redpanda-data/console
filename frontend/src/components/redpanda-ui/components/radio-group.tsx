import { Circle } from 'lucide-react';
import { AnimatePresence, type HTMLMotionProps, motion, type Transition } from 'motion/react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import React from 'react';

import { cn } from '../lib/utils';

type RadioGroupProps = React.ComponentProps<typeof RadioGroupPrimitive.Root> & {
  transition?: Transition;
  testId?: string;
};

function RadioGroup({ className, testId, ...props }: RadioGroupProps) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      data-testid={testId}
      className={cn('grid gap-2.5', className)}
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
      data-slot="radio-group-indicator"
      className={cn('flex items-center justify-center', className)}
      {...props}
    >
      <AnimatePresence>
        <motion.div
          key="radio-group-indicator-circle"
          data-slot="radio-group-indicator-circle"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0 }}
          transition={transition}
        >
          <Circle className="size-3 fill-current text-current" />
        </motion.div>
      </AnimatePresence>
    </RadioGroupPrimitive.Indicator>
  );
}

type RadioGroupItemProps = React.ComponentProps<typeof RadioGroupPrimitive.Item> &
  HTMLMotionProps<'button'> & {
    transition?: Transition;
    testId?: string;
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
        data-slot="radio-group-item"
        data-testid={testId}
        className={cn(
          'aspect-square size-5 rounded-full flex items-center justify-center border border-input text-selected ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
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
