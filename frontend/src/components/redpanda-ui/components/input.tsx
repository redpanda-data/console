/** biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: this is a complex component */
'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Eye, EyeOff, Minus, Plus } from 'lucide-react';
import React, { createContext, useEffect, useState } from 'react';

import { Button } from './button';
import { useGroup } from './group';
import { cn } from '../lib/utils';

export const inputVariants = cva(
  'file:text-foreground placeholder:!text-muted-foreground selection:bg-selection selection:text-selection-foreground dark:bg-input/30 border-input flex w-full min-w-0 border bg-transparent text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]',
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

const inputContainerVariants = cva('', {
  variants: {
    layout: {
      default: 'flex items-center relative',
      password: 'flex relative flex-1',
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
  children?: React.ReactNode;
  containerClassName?: string;
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
  (
    { className, type, showStepControls, size, variant, testId, children, containerClassName, readOnly, ...props },
    ref,
  ) => {
    const { value, setValue, showPassword, setShowPassword } = useInputState(props);
    const [startWidth, setStartWidth] = useState<number | undefined>();
    const [endWidth, setEndWidth] = useState<number | undefined>();

    const isNumberInput = type === 'number';
    const isPasswordInput = type === 'password';
    const shouldShowControls = isNumberInput && showStepControls;
    const step = props.step ? Number(props.step) : 1;
    const inputVariant = isPasswordInput ? 'password' : variant;
    const { position: groupPosition, attached: groupAttached } = useGroup();
    const attached = groupAttached || isPasswordInput;

    const { increment, decrement, handleInputChange } = useNumberInputHandlers(value, setValue, step, props.onChange);

    const inputElement = (
      <input
        {...props}
        ref={ref}
        type={isPasswordInput ? (showPassword ? 'text' : 'password') : type}
        step={isNumberInput ? step : undefined}
        value={isNumberInput ? value : props.value}
        onChange={isNumberInput ? handleInputChange : props.onChange}
        data-slot="input"
        data-testid={testId}
        className={cn(
          inputVariants({ size, variant: inputVariant }),
          attached && groupPosition === 'first'
            ? 'rounded-r-none rounded-l-md border-r-0'
            : attached && groupPosition === 'last'
              ? 'rounded-l-none rounded-r-md border-l-0'
              : attached && groupPosition === 'middle'
                ? 'rounded-none border-l-0 border-r-0'
                : 'rounded-md',
          className,
        )}
        style={{
          paddingLeft: startWidth ? startWidth + 16 : undefined,
          paddingRight: endWidth ? endWidth + 16 : undefined,
        }}
        readOnly={readOnly}
      />
    );

    return (
      <InputContext.Provider
        value={{
          startWidth,
          setStartWidth,
          endWidth,
          setEndWidth,
        }}
      >
        <div
          className={cn(
            inputContainerVariants({
              layout: shouldShowControls ? 'number' : isPasswordInput ? 'password' : variant,
            }),
            containerClassName,
          )}
        >
          {inputElement}
          {children}
          {isPasswordInput && (
            <InputEnd className="pointer-events-auto">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowPassword(!showPassword)}
                disabled={props.disabled || readOnly}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </Button>
            </InputEnd>
          )}
          {shouldShowControls && (
            <div className="flex flex-row gap-1">
              <Button
                type="button"
                onClick={decrement}
                disabled={props.disabled || readOnly}
                size={size}
                variant="outline"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                onClick={increment}
                disabled={props.disabled || readOnly}
                size={size}
                variant="outline"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </InputContext.Provider>
    );
  },
);

const inputEndClassNames = 'absolute top-1/2 -translate-y-1/2 z-10 pointer-events-none right-2';

const InputContext = createContext<{
  setStartWidth: (width: number) => void;
  setEndWidth: (width: number) => void;
  startWidth: number | undefined;
  endWidth: number | undefined;
}>({
  setStartWidth: () => {},
  setEndWidth: () => {},
  startWidth: undefined,
  endWidth: undefined,
});

const useInputContext = () => {
  const context = React.useContext(InputContext);
  if (!context) {
    throw new Error('useInputContext must be used within an InputContextProvider');
  }
  return context;
};

const InputStart = ({ children, className, ...props }: { children: React.ReactNode; className?: string }) => {
  const { setStartWidth } = useInputContext();
  const startRef = React.useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setStartWidth(startRef.current?.offsetWidth ?? 0);
  }, [setStartWidth]);

  return (
    <span
      className={cn('absolute top-1/2 -translate-y-1/2 z-10 pointer-events-none left-2', className)}
      ref={startRef}
      {...props}
    >
      {children}
    </span>
  );
};

const InputEnd = ({ children, className, ...props }: { children: React.ReactNode; className?: string }) => {
  const { setEndWidth } = useInputContext();
  const endRef = React.useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setEndWidth(endRef.current?.offsetWidth ?? 0);
  }, [setEndWidth]);

  return (
    <span className={cn(inputEndClassNames, className)} ref={endRef} {...props}>
      {children}
    </span>
  );
};

Input.displayName = 'Input';

export { Input, InputStart, InputEnd };
