'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Eye, EyeOff, Minus, Plus } from 'lucide-react';
import React, { createContext, useEffect, useState } from 'react';

import { Button } from './button';
import { useFieldContext } from './field';
import { useGroup } from './group';
import { cn, type SharedProps } from '../lib/utils';

export const inputVariants = cva(
  'placeholder:!text-muted-foreground !border-input focus-visible:!border-ring aria-invalid:!border-destructive flex w-full min-w-0 border bg-transparent text-base shadow-xs outline-none transition-[color,box-shadow] [-moz-appearance:textfield] selection:bg-selection selection:text-selection-foreground file:inline-flex file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
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

const stepControlVariants = cva('flex items-center justify-center', {
  variants: {
    size: {
      sm: 'size-8 [&_svg]:size-3.5',
      md: 'size-9 [&_svg]:size-4',
      lg: 'size-10 [&_svg]:size-5',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

const inputContainerVariants = cva('', {
  variants: {
    layout: {
      standard: 'relative flex items-center',
      password: 'relative flex w-full flex-1',
      number: 'flex items-center gap-2',
    },
  },
  defaultVariants: {
    layout: 'standard',
  },
});

export interface InputProps
  extends Omit<React.ComponentProps<'input'>, 'size'>,
    VariantProps<typeof inputVariants>,
    SharedProps {
  showStepControls?: boolean;
  children?: React.ReactNode;
  containerClassName?: string;
}

function useNumberInputHandlers(inputRef: React.RefObject<HTMLInputElement | null>, step: number) {
  // Use the native setter + dispatch a real 'input' event so React fires a genuine ChangeEvent, not a fake object.
  const setNativeValue = (newValue: string) => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    valueSetter?.call(input, newValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const stepBy = (direction: 1 | -1) => {
    const currentValue = Number.parseFloat(inputRef.current?.value ?? '') || 0;
    setNativeValue((currentValue + direction * step).toString());
  };

  const increment = () => stepBy(1);
  const decrement = () => stepBy(-1);

  return { increment, decrement };
}

function Input({
  className,
  type,
  showStepControls,
  size,
  variant,
  testId,
  children,
  containerClassName,
  readOnly,
  ref,
  ...props
}: InputProps) {
  const fieldCtx = useFieldContext();
  const [showPassword, setShowPassword] = useState(false);
  const [startWidth, setStartWidth] = useState<number | undefined>();
  const [endWidth, setEndWidth] = useState<number | undefined>();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const setRefs = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref]
  );

  const isNumberInput = type === 'number';
  const isPasswordInput = type === 'password';
  const shouldShowControls = isNumberInput && showStepControls;
  const step = props.step ? Number(props.step) : 1;
  const inputVariant = isPasswordInput ? 'password' : variant;
  const { position: groupPosition, attached: groupAttached } = useGroup();
  const attached = groupAttached || isPasswordInput;

  const { increment, decrement } = useNumberInputHandlers(inputRef, step);

  // Map input size to a button icon size that fits inside the input (sm → icon-xs, md/lg → icon-sm).
  const passwordToggleSize = size === 'sm' ? ('icon-xs' as const) : ('icon-sm' as const);

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
      aria-describedby={props['aria-describedby'] ?? fieldCtx.errorId}
      aria-invalid={props['aria-invalid'] ?? (fieldCtx.invalid || undefined)}
      className={cn(inputVariants({ size, variant: inputVariant }), positionClasses, className)}
      data-slot="input"
      {...(testId !== undefined && { 'data-testid': testId })}
      readOnly={readOnly}
      ref={setRefs}
      step={isNumberInput ? step : undefined}
      style={{
        paddingLeft: startWidth ? startWidth + 16 : undefined,
        paddingRight: endWidth ? endWidth + 16 : undefined,
      }}
      type={inputType}
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
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              disabled={props.disabled || readOnly}
              onClick={() => setShowPassword(!showPassword)}
              size={passwordToggleSize}
              type="button"
              variant="ghost"
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </Button>
          </InputEnd>
        ) : null}
        {shouldShowControls ? (
          <div className="flex flex-row gap-1">
            <Button
              aria-label="Increment value"
              className={stepControlVariants({ size })}
              disabled={props.disabled || readOnly}
              onClick={increment}
              type="button"
              variant="outline"
            >
              <Plus />
            </Button>
            <Button
              aria-label="Decrement value"
              className={stepControlVariants({ size })}
              disabled={props.disabled || readOnly}
              onClick={decrement}
              type="button"
              variant="outline"
            >
              <Minus />
            </Button>
          </div>
        ) : null}
      </div>
    </InputContext.Provider>
  );
}

const inputEndClassNames = 'absolute inset-y-0 right-2 z-10 flex items-center pointer-events-none';

const InputContext = createContext<{
  setStartWidth: (width: number) => void;
  setEndWidth: (width: number) => void;
  startWidth: number | undefined;
  endWidth: number | undefined;
}>({
  setStartWidth: () => {
    // no-op
  },
  setEndWidth: () => {
    // no-op
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
    const node = startRef.current;
    if (!node) {
      return;
    }
    setStartWidth(node.offsetWidth);
    const observer = new ResizeObserver(() => {
      setStartWidth(node.offsetWidth);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [setStartWidth]);

  return (
    <span
      className={cn('pointer-events-none absolute inset-y-0 left-2 z-10 flex items-center', className)}
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
    const node = endRef.current;
    if (!node) {
      return;
    }
    setEndWidth(node.offsetWidth);
    const observer = new ResizeObserver(() => {
      setEndWidth(node.offsetWidth);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [setEndWidth]);

  return (
    <span className={cn(inputEndClassNames, className)} ref={endRef} {...props}>
      {children}
    </span>
  );
};

export { Input, InputStart, InputEnd };
