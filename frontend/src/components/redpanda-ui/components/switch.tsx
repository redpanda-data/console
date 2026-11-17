'use client';

import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import { mergeProps, usePart, usePrimitive } from '@ui-sdk/react/primitive';
import { useFieldControl } from '@ui-sdk/react/field';
import { commitAgentChange } from '../lib/commit-agent-change';
import { baseSwitchAgent, type BaseCheckedDetails } from '../lib/primitives/base-checked-agent';
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

type SwitchProps = Omit<SwitchPrimitive.Root.Props, 'onCheckedChange'> & {
  onCheckedChange?: (checked: boolean, details: BaseCheckedDetails) => void;
} & SharedProps &
  VariantProps<typeof switchVariants>;

function Switch(allProps: SwitchProps) {
  const { className, testId, size, checked, defaultChecked, onCheckedChange, ...props } = allProps;

  // Normalize explicit `checked={undefined}` (e.g. react-hook-form initial value) to `false` so Base UI's `useControlled` doesn't warn.
  const hasCheckedProp = 'checked' in allProps;
  const checkedOverride = hasCheckedProp && checked === undefined ? false : checked;

  const field = useFieldControl({ id: props.id });
  const disabled = props.disabled || field?.disabled;
  const handle = usePrimitive(baseSwitchAgent, {
    checked: checkedOverride,
    defaultChecked,
    disabled,
    readOnly: props.readOnly,
    onCheckedChange: (next, details) => commitAgentChange(onCheckedChange, next, details),
  });
  return usePart(
    handle,
    'root',
    {},
    {
      render: (partProps, state) => (
        <SwitchPrimitive.Root
          checked={state.checked === true}
          className={cn(switchVariants({ size }), className)}
          data-size={size ?? 'md'}
          data-slot="switch"
          data-testid={testId}
          {...mergeProps(partProps, field ? field.props(props) : props)}
          disabled={disabled}
          onCheckedChange={(next, details) => {
            if (!handle.api.setChecked(next, details.event)) details.cancel();
          }}
        >
          <SwitchPrimitive.Thumb
            className={cn(
              'pointer-events-none block rounded-full bg-background ring-0 transition-transform data-checked:translate-x-[calc(100%-2px)] data-unchecked:translate-x-0 data-checked:bg-selected-foreground motion-reduce:transition-none',
              size === 'sm' ? 'size-3' : 'size-4'
            )}
            data-slot="switch-thumb"
          />
        </SwitchPrimitive.Root>
      ),
    },
    'button'
  );
}

export type { SwitchProps };
export { Switch, switchVariants };
