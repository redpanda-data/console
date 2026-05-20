import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

const toggleVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-[color,box-shadow] hover:bg-muted hover:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        ghost: 'bg-transparent',
        outline: '!border-input border bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        md: 'h-9 min-w-9 px-2',
        sm: 'h-8 min-w-8 px-1.5',
        lg: 'h-10 min-w-10 px-2.5',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'md',
    },
  }
);

type ToggleProps = Omit<React.ComponentProps<typeof TogglePrimitive>, 'onPressedChange'> &
  VariantProps<typeof toggleVariants> &
  SharedProps & {
    onPressedChange?: (pressed: boolean) => void;
  };

// biome-ignore lint/suspicious/noExplicitAny: Base UI render prop type uses HTMLProps<any>
function renderToggleButton(props: React.HTMLProps<any>, state: { pressed?: boolean; disabled?: boolean }) {
  const attrs: Record<string, unknown> = {
    'data-state': state?.pressed ? 'on' : 'off',
  };
  if (state?.disabled) {
    attrs['data-disabled'] = '';
  }
  return React.createElement('button', { ...props, ...attrs });
}

function Toggle({ className, variant, size, testId, onPressedChange, ...props }: ToggleProps) {
  const handlePressedChange = React.useMemo(() => {
    if (!onPressedChange) {
      return;
    }
    return (pressed: boolean) => onPressedChange(pressed);
  }, [onPressedChange]);

  return (
    <TogglePrimitive
      className={cn(toggleVariants({ variant, size, className }))}
      data-slot="toggle"
      data-testid={testId}
      onPressedChange={handlePressedChange}
      render={renderToggleButton}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
