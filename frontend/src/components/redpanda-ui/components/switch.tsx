'use client';

import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import type { VariantProps } from 'class-variance-authority';

import { cn, type SharedProps } from '../lib/utils';
import { switchVariants } from './switch/variants';

type SwitchProps = SwitchPrimitive.Root.Props & SharedProps & VariantProps<typeof switchVariants>;

function Switch(allProps: SwitchProps) {
  const { className, testId, size, checked, ...props } = allProps;

  // Normalize explicit `checked={undefined}` (e.g. react-hook-form initial value) to `false` so Base UI's `useControlled` doesn't warn.
  const hasCheckedProp = 'checked' in allProps;
  const checkedOverride = hasCheckedProp && checked === undefined ? false : checked;

  return (
    <SwitchPrimitive.Root
      checked={checkedOverride}
      className={cn(switchVariants({ size }), className)}
      data-size={size ?? 'md'}
      data-slot="switch"
      data-testid={testId}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block rounded-full bg-background ring-0 transition-transform data-checked:translate-x-[calc(100%-2px)] data-checked:bg-selected-foreground data-unchecked:translate-x-0 motion-reduce:transition-none',
          size === 'sm' ? 'size-3' : 'size-4'
        )}
        data-slot="switch-thumb"
      />
    </SwitchPrimitive.Root>
  );
}

export type { SwitchProps };
export { Switch };
