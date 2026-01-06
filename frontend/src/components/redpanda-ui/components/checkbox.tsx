'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { type HTMLMotionProps, motion } from 'motion/react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const checkboxVariants = cva(
  'peer flex size-5 shrink-0 items-center justify-center rounded-sm border-2 transition-colors duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'border-input data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        secondary:
          'border-input data-[state=checked]:border-secondary data-[state=checked]:bg-secondary data-[state=checked]:text-secondary-foreground',
        outline:
          'border-input data-[state=checked]:border-foreground data-[state=checked]:bg-transparent data-[state=checked]:text-foreground',
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  }
);

type CheckboxProps = React.ComponentProps<typeof CheckboxPrimitive.Root> &
  HTMLMotionProps<'button'> &
  VariantProps<typeof checkboxVariants> &
  SharedProps;

const Checkbox = React.forwardRef<React.ElementRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(
  ({ className, onCheckedChange, testId, variant, ...props }, ref) => {
    // Track state for animation purposes in uncontrolled mode
    const [internalChecked, setInternalChecked] = React.useState(props?.defaultChecked ?? false);

    // Determine if component is controlled (checked prop is provided)
    const isControlled = props?.checked !== undefined;

    // Use controlled value if provided, otherwise use internal state for uncontrolled mode
    const isChecked = isControlled ? props.checked : internalChecked;

    const handleCheckedChange = React.useCallback(
      (checked: boolean) => {
        // Only update internal state in uncontrolled mode
        if (!isControlled) {
          setInternalChecked(checked);
        }
        // Always call parent callback
        onCheckedChange?.(checked);
      },
      [isControlled, onCheckedChange]
    );

    return (
      <CheckboxPrimitive.Root ref={ref} {...props} asChild onCheckedChange={handleCheckedChange}>
        <motion.button
          className={cn(checkboxVariants({ variant, className }))}
          data-slot="checkbox"
          data-testid={testId}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          {...props}
        >
          <CheckboxPrimitive.Indicator asChild forceMount>
            <motion.svg
              animate={isChecked ? 'checked' : 'unchecked'}
              className="size-3.5"
              data-slot="checkbox-indicator"
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
          </CheckboxPrimitive.Indicator>
        </motion.button>
      </CheckboxPrimitive.Root>
    );
  }
);

Checkbox.displayName = 'Checkbox';

export { Checkbox, checkboxVariants, type CheckboxProps };
