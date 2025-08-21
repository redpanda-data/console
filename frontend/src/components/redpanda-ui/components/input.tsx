'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Eye, EyeOff, Minus, Plus } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { cn } from '../lib/utils';

const inputVariants = cva(
  'file:text-foreground placeholder:text-muted-foreground selection:bg-selected selection:text-selected-foreground dark:bg-input/30 border-input flex w-full min-w-0 rounded-md border bg-transparent text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]',
  {
    variants: {
      size: {
        sm: 'h-8 px-2.5 py-1 text-sm file:h-6',
        default: 'h-9 px-3 py-1 file:h-7',
        lg: 'h-10 px-4 py-2 file:h-8',
      },
      variant: {
        default: '',
        password: 'pr-10',
      },
    },
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
  },
);

const controlButtonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive selection:bg-selected selection:text-selected-foreground border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
  {
    variants: {
      size: {
        sm: 'h-6 w-6',
        default: 'h-8 w-8',
        lg: 'h-9 w-9',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

const passwordToggleVariants = cva(
  'absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition-colors disabled:pointer-events-none disabled:opacity-50',
);

const inputContainerVariants = cva('', {
  variants: {
    layout: {
      default: '',
      password: 'relative',
      number: 'flex items-center gap-2',
    },
  },
  defaultVariants: {
    layout: 'default',
  },
});

interface InputProps extends Omit<React.ComponentProps<'input'>, 'size'>, VariantProps<typeof inputVariants> {
  showStepControls?: boolean;
  testId?: string;
}

function useInputState(props: InputProps) {
  const [value, setValue] = useState<string>(props.value?.toString() || props.defaultValue?.toString() || '');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (props.value !== undefined) {
      setValue(props.value.toString());
    }
  }, [props.value]);

  return { value, setValue, showPassword, setShowPassword };
}

function useNumberInputHandlers(
  value: string,
  setValue: React.Dispatch<React.SetStateAction<string>>,
  step: number,
  onChange?: React.ChangeEventHandler<HTMLInputElement>,
) {
  const createChangeEvent = (newValue: string): React.ChangeEvent<HTMLInputElement> =>
    ({
      target: { value: newValue },
    }) as React.ChangeEvent<HTMLInputElement>;

  const increment = () => {
    const currentValue = Number.parseFloat(value) || 0;
    const newValue = (currentValue + step).toString();
    setValue(newValue);
    onChange?.(createChangeEvent(newValue));
  };

  const decrement = () => {
    const currentValue = Number.parseFloat(value) || 0;
    const newValue = (currentValue - step).toString();
    setValue(newValue);
    onChange?.(createChangeEvent(newValue));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    onChange?.(e);
  };

  return { increment, decrement, handleInputChange };
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, showStepControls, size, variant, testId, ...props }, ref) => {
    const { value, setValue, showPassword, setShowPassword } = useInputState(props);

    const isNumberInput = type === 'number';
    const isPasswordInput = type === 'password';
    const shouldShowControls = isNumberInput && showStepControls && props.step;
    const step = props.step ? Number(props.step) : 1;

    const inputLayout = isPasswordInput ? 'password' : shouldShowControls ? 'number' : 'default';
    const inputVariant = isPasswordInput ? 'password' : variant;

    const { increment, decrement, handleInputChange } = useNumberInputHandlers(value, setValue, step, props.onChange);

    const inputElement = (
      <input
        {...props}
        ref={ref}
        type={isPasswordInput ? (showPassword ? 'text' : 'password') : type}
        value={isNumberInput ? value : props.value}
        onChange={isNumberInput ? handleInputChange : props.onChange}
        data-slot="input"
        data-testid={testId}
        className={cn(inputVariants({ size, variant: inputVariant }), className)}
      />
    );

    // Password input with toggle
    if (isPasswordInput) {
      return (
        <div className={cn(inputContainerVariants({ layout: inputLayout }))}>
          {inputElement}
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            disabled={props.disabled}
            className={cn(passwordToggleVariants())}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      );
    }

    // Number input with step controls
    if (shouldShowControls) {
      return (
        <div className={cn(inputContainerVariants({ layout: inputLayout }))}>
          <div className="relative flex-1">{inputElement}</div>
          <div className="flex flex-row gap-1">
            <button
              type="button"
              onClick={increment}
              disabled={props.disabled}
              className={cn(controlButtonVariants({ size }))}
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={decrement}
              disabled={props.disabled}
              className={cn(controlButtonVariants({ size }))}
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>
        </div>
      );
    }

    // Standard input
    return inputElement;
  },
);

Input.displayName = 'Input';

export { Input };
