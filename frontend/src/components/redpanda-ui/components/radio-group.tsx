'use client';

import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { Circle } from 'lucide-react';

import { cn, type SharedProps } from '../lib/utils';

// Base UI's RadioGroup has no `orientation`; forward it as aria/data attrs to switch layout.
type RadioGroupOrientation = 'vertical' | 'horizontal';

type RadioGroupProps = RadioGroupPrimitive.Props &
  SharedProps & {
    orientation?: RadioGroupOrientation;
  };

function RadioGroup(allProps: RadioGroupProps) {
  const { className, orientation = 'vertical', testId, value, ...props } = allProps;

  // Keep an explicitly provided `value` controlled while form state initializes.
  const hasValueProp = 'value' in allProps;
  const valueOverride = hasValueProp && value === undefined ? '' : value;

  return (
    <RadioGroupPrimitive
      aria-orientation={orientation}
      className={cn('gap-2.5', orientation === 'horizontal' ? 'flex flex-row flex-wrap' : 'grid', className)}
      data-orientation={orientation}
      data-slot="radio-group"
      data-testid={testId}
      value={valueOverride}
      {...props}
    />
  );
}

type RadioGroupIndicatorProps = RadioPrimitive.Indicator.Props;

function RadioGroupIndicator({ className, ...props }: RadioGroupIndicatorProps) {
  return (
    <RadioPrimitive.Indicator
      className={cn(
        'flex items-center justify-center transition-[opacity,transform] ease-out data-[ending-style]:scale-50 data-[starting-style]:scale-50 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none',
        className
      )}
      data-slot="radio-group-indicator"
      {...props}
    >
      <Circle className="size-3 fill-current text-current" data-slot="radio-group-indicator-circle" />
    </RadioPrimitive.Indicator>
  );
}

type RadioGroupItemProps = RadioPrimitive.Root.Props & SharedProps;

function RadioGroupItem({ className, testId, ...props }: RadioGroupItemProps) {
  return (
    <RadioPrimitive.Root
      className={cn(
        '!border-input hover:not-disabled:!border-input-hover group/radio-group-item peer focus-visible:!border-ring aria-invalid:!border-destructive relative flex aspect-square size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border text-selected outline-none transition-colors after:absolute after:-inset-x-3 after:-inset-y-2 hover:not-disabled:bg-input-fill-hover focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-invalid motion-reduce:transition-none',
        className
      )}
      data-slot="radio-group-item"
      data-testid={testId}
      {...props}
    >
      <RadioGroupIndicator data-slot="radio-group-item-indicator" />
    </RadioPrimitive.Root>
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
