import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { Circle } from 'lucide-react';
import { AnimatePresence, type HTMLMotionProps, motion, type Transition } from 'motion/react';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

// Radix RadioGroup supported an `orientation` prop; Base UI's RadioGroup does not
// declare one. Preserve the public API by accepting it and forwarding as
// `aria-orientation` + data attribute.
type RadioGroupOrientation = 'vertical' | 'horizontal';

type RadioGroupProps = Omit<React.ComponentProps<typeof RadioGroupPrimitive>, 'onValueChange'> &
  SharedProps & {
    orientation?: RadioGroupOrientation;
    onValueChange?: (value: string) => void;
    transition?: Transition;
  };

function RadioGroup(allProps: RadioGroupProps) {
  const { className, orientation = 'vertical', testId, onValueChange, ...props } = allProps;

  const handleValueChange = React.useMemo(() => {
    if (!onValueChange) {
      return;
    }
    return (next: unknown) => onValueChange(next as string);
  }, [onValueChange]);

  // Radix parity: when consumers explicitly pass `value` (controlled mode) but
  // their source-of-truth starts as `undefined` (e.g. react-hook-form
  // `field.value` before the first change), Base UI's `useControlled` warns on
  // the undefined → string transition. Radix tolerated this silently. Normalize
  // undefined → '' only when `value` was explicitly passed — uncontrolled mode
  // via `defaultValue` (without `value`) keeps working unchanged.
  const hasValueProp = 'value' in allProps;
  const valueOverride = hasValueProp && allProps.value === undefined ? { value: '' } : undefined;

  return (
    <RadioGroupPrimitive
      aria-orientation={orientation}
      className={cn('grid gap-2.5', orientation === 'horizontal' && 'grid-cols-2', className)}
      data-orientation={orientation}
      data-slot="radio-group"
      data-testid={testId}
      onValueChange={handleValueChange}
      {...props}
      {...valueOverride}
    />
  );
}

type RadioGroupIndicatorProps = React.ComponentProps<typeof RadioPrimitive.Indicator> & {
  transition: Transition;
};

function RadioGroupIndicator({ className, transition, ...props }: RadioGroupIndicatorProps) {
  return (
    <RadioPrimitive.Indicator
      className={cn('flex items-center justify-center data-[unchecked]:hidden', className)}
      data-slot="radio-group-indicator"
      keepMounted
      {...props}
    >
      <AnimatePresence>
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center justify-center"
          data-slot="radio-group-indicator-circle"
          exit={{ opacity: 0, scale: 0 }}
          initial={{ opacity: 0, scale: 0 }}
          key="radio-group-indicator-circle"
          transition={transition}
        >
          <Circle className="size-3 fill-current text-current" />
        </motion.div>
      </AnimatePresence>
    </RadioPrimitive.Indicator>
  );
}

type RadioGroupItemProps = React.ComponentProps<typeof RadioPrimitive.Root> &
  HTMLMotionProps<'button'> &
  SharedProps & {
    transition?: Transition;
  };

function RadioGroupItem({ className, transition = { duration: 0.15 }, testId, ...props }: RadioGroupItemProps) {
  return (
    <RadioPrimitive.Root
      {...(props as React.ComponentProps<typeof RadioPrimitive.Root>)}
      nativeButton
      // biome-ignore lint/suspicious/noExplicitAny: Base UI render merges Root attrs for the consumer element
      render={(rootProps: Record<string, any>, state: { checked?: boolean; disabled?: boolean }) => (
        <motion.button
          {...rootProps}
          className={cn(
            '!border-input flex aspect-square size-5 cursor-pointer items-center justify-center rounded-full border text-selected ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          data-slot="radio-group-item"
          data-state={state?.checked ? 'checked' : 'unchecked'}
          data-testid={testId}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <RadioGroupIndicator data-slot="radio-group-item-indicator" transition={transition} />
        </motion.button>
      )}
    />
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
