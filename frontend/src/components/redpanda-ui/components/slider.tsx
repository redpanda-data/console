'use client';

import { Slider as SliderPrimitive } from 'radix-ui';
import React from 'react';

import { cn } from '../lib/utils';

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  testId,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & { testId?: string }) {
  const _values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max],
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      data-testid={testId}
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          'bg-muted relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5',
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn('bg-selected absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full')}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          // biome-ignore lint/suspicious/noArrayIndexKey: part of slider implementation
          key={index}
          className="border-selected bg-background ring-selected/50 block size-4 shrink-0 rounded-full border shadow-sm transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
