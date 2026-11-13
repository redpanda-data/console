'use client';

// Copyright 2026 Redpanda Data, Inc.

import { commitAgentChange } from '../lib/commit-agent-change';
import * as SliderPrimitive from '@ui-sdk/react/slider';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

type SliderProps = Omit<
  React.ComponentProps<typeof SliderPrimitive.Slider>,
  'value' | 'defaultValue' | 'onValueChange'
> &
  SharedProps & {
    value?: number | readonly number[];
    defaultValue?: number | readonly number[];
    onValueChange?: (value: number[], eventDetails?: SliderPrimitive.SliderValueChangeDetails) => void;
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
    return (nextValue: number | readonly number[], eventDetails: SliderPrimitive.SliderValueChangeDetails) => {
      const asArray = Array.isArray(nextValue) ? [...nextValue] : [nextValue as number];
      commitAgentChange(onValueChange, asArray, eventDetails);
    };
  }, [onValueChange]);
  const thumbKeys = values.map((_thumbValue, position) => `thumb-${position}`);

  return (
    <SliderPrimitive.Slider
      className={cn(
        'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
        className
      )}
      data-slot="slider"
      data-testid={testId}
      defaultValue={typeof defaultValue === 'number' ? defaultValue : defaultValue && [...defaultValue]}
      max={max}
      min={min}
      onValueChange={handleValueChange}
      value={typeof value === 'number' ? value : value && [...value]}
      {...props}
    >
      <SliderPrimitive.SliderControl className="relative flex w-full grow touch-none items-center select-none data-[orientation=vertical]:h-full data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col">
        <SliderPrimitive.SliderTrack
          className={cn(
            'relative grow overflow-hidden rounded-full bg-surface-subtle data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5'
          )}
          data-slot="slider-track"
        >
          <SliderPrimitive.SliderIndicator
            className={cn(
              'absolute bg-selected data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full'
            )}
            data-slot="slider-range"
          />
        </SliderPrimitive.SliderTrack>
        {thumbKeys.map((thumbKey, index) => (
          <SliderPrimitive.SliderThumb
            /* A 4px ring rather than the registry's usual 3px, for both hover and
               focus: the thumb is a 16px drag target, so the halo is the whole
               affordance rather than a hint next to a label. Deliberate exception. */
            className="block size-4 shrink-0 rounded-full border border-selected bg-background shadow-sm ring-selected/50 transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden active:ring-4 active:ring-selected/70 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none"
            data-slot="slider-thumb"
            index={index}
            key={thumbKey}
          />
        ))}
      </SliderPrimitive.SliderControl>
    </SliderPrimitive.Slider>
  );
}

export { Slider };
