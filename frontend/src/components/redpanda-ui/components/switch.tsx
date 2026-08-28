'use client';

import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn, type SharedProps } from '../lib/utils';

const switchVariants = cva(
  'peer group/switch aria-invalid:!border-destructive relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-xs outline-none transition-all after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:ring-invalid data-disabled:cursor-not-allowed data-checked:not-data-disabled:bg-selected data-disabled:bg-surface-disabled data-unchecked:not-data-disabled:bg-input data-disabled:opacity-50 data-unchecked:hover:not-data-disabled:bg-input-hover motion-reduce:transition-none',
  {
    variants: {
      size: {
        sm: 'h-3.5 w-6',
        md: 'h-[1.15rem] w-8',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

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
          'pointer-events-none block rounded-full bg-background ring-0 transition-transform data-checked:translate-x-[calc(100%-2px)] data-unchecked:translate-x-0 data-checked:bg-selected-foreground motion-reduce:transition-none',
          size === 'sm' ? 'size-3' : 'size-4'
        )}
        data-slot="switch-thumb"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch, switchVariants };
export type { SwitchProps };
