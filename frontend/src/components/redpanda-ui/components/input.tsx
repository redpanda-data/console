/** biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: this is a complex component */
'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Eye, EyeOff, Minus, Plus } from 'lucide-react';
import React, { createContext, useEffect, useState } from 'react';

import { Button } from './button';
import { useGroup } from './group';
import { cn, type SharedProps } from '../lib/utils';

export const inputVariants = cva(
  'placeholder:!text-muted-foreground flex w-full min-w-0 !border !border-input bg-transparent text-base shadow-xs outline-none transition-[color,box-shadow] [-moz-appearance:textfield] selection:bg-selection selection:text-selection-foreground file:inline-flex file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
  {
    variants: {
      size: {
        sm: 'h-8 px-2.5 py-1 text-sm file:h-6',
        md: 'h-9 px-3 py-1 file:h-7',
        lg: 'h-10 px-4 py-2 file:h-8',
      },
      variant: {
        standard: '',
        password: 'pr-10',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'standard',
    },
  }
);

const inputContainerVariants = cva('', {
  variants: {
    layout: {
      standard: 'relative flex items-center',
      password: 'relative flex flex-1',
      number: 'flex items-center gap-2',
    },
  },
  defaultVariants: {
    layout: 'standard',
  },
});

interface InputProps
  extends Omit<React.ComponentProps<'input'>, 'size'>,
    VariantProps<typeof inputVariants>,
    SharedProps {
  showStepControls?: boolean;
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
  onChange?: React.ChangeEventHandler<HTMLInputElement>
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
    ref
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

    let positionClasses = 'rounded-md';
    if (attached && groupPosition === 'first') {
      positionClasses = 'rounded-r-none rounded-l-md border-r-0';
    } else if (attached && groupPosition === 'last') {
      positionClasses = 'rounded-r-md rounded-l-none border-l-0';
    } else if (attached && groupPosition === 'middle') {
      positionClasses = 'rounded-none border-r-0 border-l-0';
    }

    let inputType = type;
    if (isPasswordInput) {
      inputType = showPassword ? 'text' : 'password';
    }

    let layout: 'number' | 'password' | typeof variant = variant;
    if (shouldShowControls) {
      layout = 'number';
    } else if (isPasswordInput) {
      layout = 'password';
    }

    const inputElement = (
      <input
        {...props}
        className={cn(inputVariants({ size, variant: inputVariant }), positionClasses, className)}
        data-slot="input"
        data-testid={testId}
        onChange={isNumberInput ? handleInputChange : props.onChange}
        readOnly={readOnly}
        ref={ref}
        step={isNumberInput ? step : undefined}
        style={{
          paddingLeft: startWidth ? startWidth + 16 : undefined,
          paddingRight: endWidth ? endWidth + 16 : undefined,
        }}
        type={inputType}
        value={isNumberInput ? value : props.value}
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
              layout,
            }),
            containerClassName
          )}
        >
          {inputElement}
          {children}
          {isPasswordInput ? (
            <InputEnd className="pointer-events-auto">
              <Button
                disabled={props.disabled || readOnly}
                onClick={() => setShowPassword(!showPassword)}
                type="button"
                variant="ghost"
                size="icon-lg"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </Button>
            </InputEnd>
          ) : null}
          {shouldShowControls ? (
            <div className="flex flex-row gap-1">
              <Button
                disabled={props.disabled || readOnly}
                onClick={increment}
                size={size}
                type="button"
                variant="outline"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                disabled={props.disabled || readOnly}
                onClick={decrement}
                size={size}
                type="button"
                variant="outline"
              >
                <Minus className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      </InputContext.Provider>
    );
  }
);

const inputEndClassNames = 'absolute top-1/2 -translate-y-1/2 z-10 pointer-events-none right-2';

const InputContext = createContext<{
  setStartWidth: (width: number) => void;
  setEndWidth: (width: number) => void;
  startWidth: number | undefined;
  endWidth: number | undefined;
}>({
  setStartWidth: () => {
    // Default no-op function
  },
  setEndWidth: () => {
    // Default no-op function
  },
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
      className={cn('pointer-events-none absolute top-1/2 left-2 z-10 -translate-y-1/2', className)}
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
