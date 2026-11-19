'use client';

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import type { VariantProps } from 'class-variance-authority';
import React from 'react';
import { cn, type SharedProps } from '../lib/utils';
import { requireInstance } from '../lib/utils/require-instance';
import { checkboxVariants } from './checkbox/variants';

// CSS-driven path-draw: pathLength={1} normalizes the dash space to 0..1; the native transition tweens
// stroke-dashoffset/opacity (immune to React re-render frequency); 100ms delay lets the box-fill lead the stroke.
const pathDrawClassName =
  '[stroke-dasharray:1] [stroke-dashoffset:1] opacity-0 transition-[stroke-dashoffset,opacity] duration-200 ease-out motion-reduce:transition-none data-[visible=true]:[stroke-dashoffset:0] data-[visible=true]:opacity-100 data-[visible=true]:delay-[100ms]';

/** The `data-state` the variants key off. Mixed wins: Base UI carries it beside `checked`. */
const dataStateFor = (checked: boolean, indeterminate: boolean): 'indeterminate' | 'checked' | 'unchecked' => {
  if (indeterminate) {
    return 'indeterminate';
  }
  return checked ? 'checked' : 'unchecked';
};

// Exposes the Radix `checked: boolean | 'indeterminate'` signature; translated to Base UI's separate props internally.
type CheckboxProps = Omit<
  React.ComponentProps<typeof CheckboxPrimitive.Root>,
  'checked' | 'defaultChecked' | 'onCheckedChange' | 'ref'
> &
  VariantProps<typeof checkboxVariants> &
  SharedProps & {
    checked?: boolean | 'indeterminate' | undefined;
    defaultChecked?: boolean | 'indeterminate' | undefined;
    onCheckedChange?:
      | ((checked: boolean | 'indeterminate', eventDetails: CheckboxPrimitive.Root.ChangeEventDetails) => void)
      | undefined;
    ref?: React.Ref<HTMLButtonElement> | undefined;
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

  const handleCheckedChange = (nextChecked: boolean, eventDetails: CheckboxPrimitive.Root.ChangeEventDetails) => {
    setUncontrolledIndeterminate(false);
    onCheckedChange?.(nextChecked, eventDetails);
  };

  // Translate Radix `checked='indeterminate'` to Base UI `indeterminate` + `checked=false`.
  const isIndeterminate = indeterminate ?? (isControlled ? checked === 'indeterminate' : uncontrolledIndeterminate);
  const baseChecked = isControlled ? checked === true : undefined;
  const baseDefaultChecked = defaultChecked === 'indeterminate' ? false : defaultChecked;

  const renderRoot = (rootProps: React.ComponentProps<'button'>, state: CheckboxPrimitive.Root.State) => {
    const dataState = dataStateFor(state.checked, state.indeterminate);
    const showCheckmark = state.checked && !state.indeterminate;

    return (
      <button
        {...rootProps}
        className={cn(checkboxVariants({ variant, className }))}
        data-slot="checkbox"
        data-state={dataState}
        // A caller's own `data-testid` survives when `testId` is unset.
        {...(testId !== undefined && { 'data-testid': testId })}
      >
        <CheckboxPrimitive.Indicator
          keepMounted
          render={({ ref: _indicatorRef, ...indicatorProps }) => (
            // Decorative: the button carries the checked state, and a <title> would leak into its name.
            <svg
              {...indicatorProps}
              aria-hidden="true"
              className="size-3"
              data-slot="checkbox-indicator"
              data-state={dataState}
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
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
  };

  return (
    <CheckboxPrimitive.Root
      {...props}
      checked={baseChecked}
      defaultChecked={baseDefaultChecked}
      indeterminate={isIndeterminate}
      nativeButton
      onCheckedChange={handleCheckedChange}
      ref={(node) => {
        const button = node === null ? null : requireInstance(node, HTMLButtonElement, 'Expected Checkbox button');
        if (typeof ref === 'function') {
          return ref(button);
        }
        if (ref !== undefined && ref !== null) {
          ref.current = button;
        }
      }}
      render={renderRoot}
    />
  );
}

/** Decorative selection ink. The containing control owns interaction and accessible state. */
export interface CheckboxViewProps
  extends Omit<React.ComponentProps<'div'>, 'aria-hidden' | 'children' | 'role'>,
    VariantProps<typeof checkboxVariants>,
    SharedProps {
  checked: boolean | 'indeterminate';
}

function CheckboxView({ checked, className, variant, testId, ...props }: CheckboxViewProps) {
  const isIndeterminate = checked === 'indeterminate';
  const dataState = dataStateFor(checked === true, isIndeterminate);
  const showCheckmark = checked === true;

  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn(checkboxVariants({ variant, className }), 'cursor-default')}
      data-slot="checkbox-view"
      data-state={dataState}
      // A caller's own `data-testid` survives when `testId` is unset.
      {...(testId !== undefined && { 'data-testid': testId })}
    >
      <svg
        aria-hidden="true"
        className="size-3"
        data-slot="checkbox-view-indicator"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
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

export { Checkbox, type CheckboxProps, CheckboxView };
