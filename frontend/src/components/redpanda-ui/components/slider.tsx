// Copyright 2026 Redpanda Data, Inc.

'use client';

import { Slider as SliderPrimitive } from '@base-ui/react/slider';
import type React from 'react';
import { cn, type SharedProps } from '../lib/utils';

type SliderProps = Omit<React.ComponentProps<typeof SliderPrimitive.Root>, 'value' | 'defaultValue' | 'onValueChange'> &
  SharedProps & {
    value?: number | readonly number[] | undefined;
    defaultValue?: number | readonly number[] | undefined;
    onValueChange?: ((value: number[], eventDetails?: SliderPrimitive.Root.ChangeEventDetails) => void) | undefined;
  };

function Slider({ className, defaultValue, value, min = 0, max = 100, testId, onValueChange, ...props }: SliderProps) {
  const suppliedValue = value ?? defaultValue;
  const values = typeof suppliedValue === 'number' ? [suppliedValue] : (suppliedValue ?? [min, max]);

  function handleValueChange(
    nextValue: number | readonly number[],
    eventDetails: SliderPrimitive.Root.ChangeEventDetails
  ) {
    const asArray = typeof nextValue === 'number' ? [nextValue] : [...nextValue];
    onValueChange?.(asArray, eventDetails);
  }
  const thumbKeys = values.map((_thumbValue, position) => `thumb-${position}`);

  return (
    <SliderPrimitive.Root
      className={cn(
        'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
        className
      )}
      data-slot="slider"
      data-testid={testId}
      defaultValue={defaultValue}
      max={max}
      min={min}
      onValueChange={onValueChange === undefined ? undefined : handleValueChange}
      value={value}
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full grow touch-none items-center select-none data-[orientation=vertical]:h-full data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col">
        <SliderPrimitive.Track
          className={cn(
            'relative grow overflow-hidden rounded-full bg-surface-subtle data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5'
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
        {thumbKeys.map((thumbKey, index) => (
          <SliderPrimitive.Thumb
            /* The 16px thumb keeps its 4px pointer halo. Keyboard focus belongs to
               the native range input inside it and paints the standard 3px ring. */
            className="block size-4 shrink-0 rounded-full border border-selected bg-background shadow-sm ring-selected/50 transition-[color,box-shadow] hover:ring-4 active:ring-4 active:ring-selected/70 disabled:pointer-events-none disabled:opacity-50 has-focus-visible:ring-3 has-focus-visible:outline-hidden motion-reduce:transition-none"
            data-slot="slider-thumb"
            index={index}
            key={thumbKey}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
