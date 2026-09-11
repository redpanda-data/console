'use client';

import { Slider as SliderPrimitive } from '@base-ui/react/slider';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

type SliderProps = Omit<React.ComponentProps<typeof SliderPrimitive.Root>, 'value' | 'defaultValue' | 'onValueChange'> &
  SharedProps & {
    value?: number | readonly number[];
    defaultValue?: number | readonly number[];
    onValueChange?: (value: number[], eventDetails?: SliderPrimitive.Root.ChangeEventDetails) => void;
  };

function Slider({ className, defaultValue, value, min = 0, max = 100, testId, onValueChange, ...props }: SliderProps) {
  const values = React.useMemo(() => {
    if (Array.isArray(value)) {
      return value;
    }
    if (Array.isArray(defaultValue)) {
      return defaultValue;
    }
    return [min, max];
  }, [value, defaultValue, min, max]);

  const handleValueChange = React.useMemo(() => {
    if (!onValueChange) {
      return;
    }
    return (nextValue: number | readonly number[], eventDetails: SliderPrimitive.Root.ChangeEventDetails) => {
      const asArray = Array.isArray(nextValue) ? [...nextValue] : [nextValue as number];
      onValueChange(asArray, eventDetails);
    };
  }, [onValueChange]);

  return (
    <SliderPrimitive.Root
      className={cn(
        'relative flex w-full touch-none select-none items-center data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col data-[disabled]:opacity-50',
        className
      )}
      data-slot="slider"
      data-testid={testId}
      defaultValue={defaultValue}
      max={max}
      min={min}
      onValueChange={handleValueChange}
      value={value}
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full grow touch-none select-none items-center data-[orientation=vertical]:h-full data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col">
        <SliderPrimitive.Track
          className={cn(
            'relative grow overflow-hidden rounded-full bg-surface-subtle data-[orientation=horizontal]:h-1.5 data-[orientation=vertical]:h-full data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-1.5'
          )}
          data-slot="slider-track"
        >
          <SliderPrimitive.Indicator
            className={cn(
              'absolute bg-selected data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full'
            )}
            data-slot="slider-range"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            /* A 4px ring rather than the registry's usual 3px, for both hover and
               focus: the thumb is a 16px drag target, so the halo is the whole
               affordance rather than a hint next to a label. Deliberate exception. */
            className="block size-4 shrink-0 rounded-full border border-selected bg-background shadow-sm ring-selected/50 transition-[color,box-shadow] hover:ring-4 focus-visible:outline-hidden focus-visible:ring-4 active:ring-4 active:ring-selected/70 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
            data-slot="slider-thumb"
            index={index}
            // biome-ignore lint/suspicious/noArrayIndexKey: part of slider implementation
            key={index}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
