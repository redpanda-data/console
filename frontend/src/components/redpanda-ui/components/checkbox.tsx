'use client';

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

// CSS-driven path-draw: pathLength={1} normalizes the dash space to 0..1; the native transition tweens
// stroke-dashoffset/opacity (immune to React re-render frequency); 100ms delay lets the box-fill lead the stroke.
const pathDrawClassName =
  '[stroke-dasharray:1] [stroke-dashoffset:1] opacity-0 transition-[stroke-dashoffset,opacity] duration-200 ease-out data-[visible=true]:[stroke-dashoffset:0] data-[visible=true]:opacity-100 data-[visible=true]:delay-[100ms]';

const checkboxVariants = cva(
  'peer aria-invalid:!border-destructive flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[4px] border transition-colors duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
  {
    variants: {
      variant: {
        primary:
          '!border-input data-[state=checked]:border-primary data-[state=indeterminate]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:bg-primary data-[state=checked]:text-inverse data-[state=indeterminate]:text-inverse',
        secondary:
          '!border-input data-[state=checked]:border-secondary data-[state=indeterminate]:border-secondary data-[state=checked]:bg-secondary data-[state=indeterminate]:bg-secondary data-[state=checked]:text-inverse data-[state=indeterminate]:text-inverse',
        outline:
          '!border-input data-[state=checked]:border-foreground data-[state=indeterminate]:border-foreground data-[state=checked]:bg-transparent data-[state=indeterminate]:bg-transparent data-[state=checked]:text-foreground data-[state=indeterminate]:text-foreground',
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  }
);

// Exposes the Radix `checked: boolean | 'indeterminate'` signature; translated to Base UI's separate props internally.
type CheckboxProps = Omit<
  React.ComponentProps<typeof CheckboxPrimitive.Root>,
  'checked' | 'defaultChecked' | 'onCheckedChange' | 'ref'
> &
  VariantProps<typeof checkboxVariants> &
  SharedProps & {
    checked?: boolean | 'indeterminate';
    defaultChecked?: boolean | 'indeterminate';
    onCheckedChange?: (
      checked: boolean | 'indeterminate',
      eventDetails: CheckboxPrimitive.Root.ChangeEventDetails
    ) => void;
    ref?: React.Ref<HTMLButtonElement>;
  };

function Checkbox({
  className,
  onCheckedChange,
  testId,
  variant,
  checked,
  defaultChecked,
  indeterminate,
  ref,
  ...props
}: CheckboxProps) {
  const isControlled = checked !== undefined;

  // Base UI treats `indeterminate` as a plain prop, so the wrapper tracks the
  // uncontrolled mixed state itself (cleared on first interaction).
  const [uncontrolledIndeterminate, setUncontrolledIndeterminate] = React.useState(defaultChecked === 'indeterminate');

  const handleCheckedChange = React.useCallback(
    (nextChecked: boolean, eventDetails: CheckboxPrimitive.Root.ChangeEventDetails) => {
      setUncontrolledIndeterminate(false);
      onCheckedChange?.(nextChecked, eventDetails);
    },
    [onCheckedChange]
  );

  // Translate Radix `checked='indeterminate'` to Base UI `indeterminate` + `checked=false`.
  const isIndeterminate = indeterminate ?? (isControlled ? checked === 'indeterminate' : uncontrolledIndeterminate);
  const baseChecked = isControlled ? checked === true : undefined;
  const baseDefaultChecked = defaultChecked === 'indeterminate' ? false : defaultChecked;

  const renderRoot = React.useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: Base UI render merges Root attrs for the consumer element
    (rootProps: Record<string, any>, state: CheckboxPrimitive.Root.State) => {
      const dataState = state.indeterminate ? 'indeterminate' : state.checked ? 'checked' : 'unchecked';
      const showCheckmark = state.checked && !state.indeterminate;

      return (
        <button
          {...rootProps}
          className={cn(checkboxVariants({ variant, className }))}
          data-slot="checkbox"
          data-state={dataState}
          data-testid={testId}
        >
          <CheckboxPrimitive.Indicator
            keepMounted
            // biome-ignore lint/suspicious/noExplicitAny: Base UI render merges Indicator attrs for the consumer element
            render={(indicatorProps: Record<string, any>) => (
              <svg
                {...indicatorProps}
                className="size-3"
                data-slot="checkbox-indicator"
                data-state={dataState}
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <title>Checkbox</title>
                <path
                  className={pathDrawClassName}
                  d="M4.5 12.75l6 6 9-13.5"
                  data-visible={showCheckmark}
                  pathLength={1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  className={pathDrawClassName}
                  d="M5 12h14"
                  data-visible={state.indeterminate}
                  pathLength={1}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          />
        </button>
      );
    },
    [className, testId, variant]
  );

  return (
    <CheckboxPrimitive.Root
      {...(props as React.ComponentProps<typeof CheckboxPrimitive.Root>)}
      checked={baseChecked}
      defaultChecked={baseDefaultChecked}
      indeterminate={isIndeterminate}
      nativeButton
      onCheckedChange={handleCheckedChange}
      ref={ref as React.Ref<HTMLElement>}
      render={renderRoot}
    />
  );
}

// Presentational, stateless sibling of `Checkbox` (no Base UI primitive). For row-selection surfaces where
// many controlled `Checkbox` instances under a re-rendering parent would hit React's max-update-depth limit.
export interface CheckboxViewProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>,
    VariantProps<typeof checkboxVariants> {
  checked: boolean | 'indeterminate';
  ref?: React.Ref<HTMLDivElement>;
}

function CheckboxView({ checked, className, variant, ref, ...divProps }: CheckboxViewProps) {
  const isIndeterminate = checked === 'indeterminate';
  const dataState = isIndeterminate ? 'indeterminate' : checked ? 'checked' : 'unchecked';
  const showCheckmark = checked === true;

  return (
    <div
      aria-checked={isIndeterminate ? 'mixed' : checked}
      className={cn(checkboxVariants({ variant, className }), 'cursor-default')}
      data-slot="checkbox-view"
      data-state={dataState}
      ref={ref}
      role="checkbox"
      {...divProps}
    >
      <svg
        className="size-3"
        data-slot="checkbox-view-indicator"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>Checkbox</title>
        <path
          className={pathDrawClassName}
          d="M4.5 12.75l6 6 9-13.5"
          data-visible={showCheckmark}
          pathLength={1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          className={pathDrawClassName}
          d="M5 12h14"
          data-visible={isIndeterminate}
          pathLength={1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export { Checkbox, CheckboxView, checkboxVariants, type CheckboxProps };
