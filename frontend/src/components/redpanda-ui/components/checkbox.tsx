'use client';

import { type HTMLMotionProps, motion } from 'motion/react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import React from 'react';

import { cn } from '../lib/utils';

type CheckboxProps = React.ComponentProps<typeof CheckboxPrimitive.Root> &
  HTMLMotionProps<'button'> & {
    testId?: string;
  };

const Checkbox = React.forwardRef<React.ElementRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(
  ({ className, onCheckedChange, testId, ...props }, ref) => {
    const [isChecked, setIsChecked] = React.useState(props?.checked ?? props?.defaultChecked ?? false);

    React.useEffect(() => {
      if (props?.checked !== undefined) setIsChecked(props.checked);
    }, [props?.checked]);

    const handleCheckedChange = React.useCallback(
      (checked: boolean) => {
        setIsChecked(checked);
        onCheckedChange?.(checked);
      },
      [onCheckedChange],
    );

    return (
      <CheckboxPrimitive.Root ref={ref} {...props} onCheckedChange={handleCheckedChange} asChild>
        <motion.button
          data-slot="checkbox"
          data-testid={testId}
          className={cn(
            'peer size-5 flex items-center justify-center shrink-0 rounded-sm border-2 border-input transition-colors duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:text-white data-[state=checked]:border-foreground',
            className,
          )}
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.05 }}
          {...props}
        >
          <CheckboxPrimitive.Indicator forceMount asChild>
            <motion.svg
              data-slot="checkbox-indicator"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="3.5"
              stroke="currentColor"
              className="size-3.5"
              initial="unchecked"
              animate={isChecked ? 'checked' : 'unchecked'}
            >
              <title>Checkbox</title>
              <motion.path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
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
  },
);

Checkbox.displayName = 'Checkbox';

export { Checkbox, type CheckboxProps };
