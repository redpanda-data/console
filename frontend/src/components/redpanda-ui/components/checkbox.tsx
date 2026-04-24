'use client';

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { cva, type VariantProps } from 'class-variance-authority';
import { type HTMLMotionProps, motion } from 'motion/react';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const checkboxVariants = cva(
  'peer flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm border-2 transition-colors duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          '!border-input data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-inverse',
        secondary:
          '!border-input data-[state=checked]:border-secondary data-[state=checked]:bg-secondary data-[state=checked]:text-inverse',
        outline:
          '!border-input data-[state=checked]:border-foreground data-[state=checked]:bg-transparent data-[state=checked]:text-foreground',
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  }
);

// Radix API: `checked` accepts `boolean | 'indeterminate'`.
// Base UI API: `checked: boolean` with a separate `indeterminate?: boolean` prop.
// Preserve the Radix signature externally and translate internally.
type CheckboxProps = Omit<
  React.ComponentProps<typeof CheckboxPrimitive.Root>,
  'checked' | 'defaultChecked' | 'onCheckedChange'
> &
  HTMLMotionProps<'button'> &
  VariantProps<typeof checkboxVariants> &
  SharedProps & {
    checked?: boolean | 'indeterminate';
    defaultChecked?: boolean | 'indeterminate';
    onCheckedChange?: (checked: boolean | 'indeterminate') => void;
  };

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, onCheckedChange, testId, variant, checked, defaultChecked, indeterminate, ...props }, ref) => {
    // Track state for animation purposes in uncontrolled mode
    const [internalChecked, setInternalChecked] = React.useState<boolean | 'indeterminate'>(defaultChecked ?? false);

    // Determine if component is controlled (checked prop is provided)
    const isControlled = checked !== undefined;

    // Use controlled value if provided, otherwise use internal state for uncontrolled mode
    const isChecked = isControlled ? checked : internalChecked;

    const handleCheckedChange = React.useCallback(
      (nextChecked: boolean) => {
        // Only update internal state in uncontrolled mode
        if (!isControlled) {
          setInternalChecked(nextChecked);
        }
        // Always call parent callback
        onCheckedChange?.(nextChecked);
      },
      [isControlled, onCheckedChange]
    );

    // Translate Radix `checked='indeterminate'` to Base UI `indeterminate` + `checked=false`.
    const isIndeterminate = indeterminate ?? isChecked === 'indeterminate';
    const baseChecked = isChecked === 'indeterminate' ? false : (isChecked as boolean | undefined);
    const baseDefaultChecked =
      (defaultChecked as unknown) === 'indeterminate' ? false : (defaultChecked as boolean | undefined);

    const dataState = isIndeterminate ? 'indeterminate' : isChecked ? 'checked' : 'unchecked';

    const renderRoot = React.useCallback(
      // biome-ignore lint/suspicious/noExplicitAny: Base UI render merges Root attrs for the consumer element
      (rootProps: Record<string, any>) => (
        <motion.button
          {...rootProps}
          className={cn(checkboxVariants({ variant, className }))}
          data-slot="checkbox"
          data-state={dataState}
          data-testid={testId}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <CheckboxPrimitive.Indicator
            keepMounted
            // biome-ignore lint/suspicious/noExplicitAny: Base UI render merges Indicator attrs for the consumer element
            render={(indicatorProps: Record<string, any>) => (
              <motion.svg
                {...indicatorProps}
                animate={isChecked === true ? 'checked' : 'unchecked'}
                className="size-3.5"
                data-slot="checkbox-indicator"
                data-state={dataState}
                fill="none"
                initial="unchecked"
                stroke="currentColor"
                strokeWidth="3.5"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <title>Checkbox</title>
                <motion.path
                  d="M4.5 12.75l6 6 9-13.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  variants={{
                    checked: {
                      pathLength: 1,
                      opacity: 1,
                      transition: {
                        duration: 0.2,
                        delay: 0.2,
                      },
                    },
                    unchecked: {
                      pathLength: 0,
                      opacity: 0,
                      transition: {
                        duration: 0.2,
                      },
                    },
                  }}
                />
              </motion.svg>
            )}
          />
        </motion.button>
      ),
      [className, dataState, isChecked, testId, variant]
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
);

Checkbox.displayName = 'Checkbox';

export { Checkbox, checkboxVariants, type CheckboxProps };
