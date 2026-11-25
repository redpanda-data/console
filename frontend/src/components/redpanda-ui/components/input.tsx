'use client';

import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import { Eye, EyeOff, Minus, Plus } from 'lucide-react';
import React, { createContext, useEffect, useState } from 'react';
import { Button } from './button';
import { useFieldContext } from './field';
import { cn, type DataAttributes, type SharedProps } from '../lib/utils';
import { inputVariants } from './input/variants';

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
  children?: React.ReactNode | undefined;
  containerClassName?: string | undefined;
  showStepControls?: boolean | undefined;
}

function useNumberInputHandlers(inputRef: React.RefObject<HTMLInputElement | null>) {
  // Use the native setter + dispatch a real 'input' event so React fires a genuine ChangeEvent, not a fake object.
  const setNativeValue = (newValue: string) => {
    const input = inputRef.current;
    if (input === null) {
      return;
    }
    const valueDescriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    valueDescriptor?.set?.call(input, newValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const stepBy = (direction: 1 | -1) => {
    const input = inputRef.current;
    if (input === null || input.step === 'any') {
      return;
    }
    const previousValue = input.value;
    // Native stepping respects the step base, bounds, and decimal precision.
    if (direction === 1) {
      input.stepUp();
    } else {
      input.stepDown();
    }
    if (input.value !== previousValue) {
      setNativeValue(input.value);
    }
  };

  const increment = () => {
    stepBy(1);
  };
  const decrement = () => {
    stepBy(-1);
  };

  return { increment, decrement };
}

function adornmentPadding(width: number | undefined): string | undefined {
  if (width === undefined || width === 0 || Number.isNaN(width)) {
    return;
  }
  return `${width + 16}px`;
}

function adornmentLayout(startWidth: number | undefined, endWidth: number | undefined) {
  const startPadding = adornmentPadding(startWidth);
  const endPadding = adornmentPadding(endWidth);

  return {
    className: cn(
      startPadding !== undefined && 'pl-(--input-start-padding)',
      endPadding !== undefined && 'pr-(--input-end-padding)'
    ),
    startPadding,
    endPadding,
  };
}

function inputLayout(type: InputProps['type'], showControls: boolean, variant: InputProps['variant']) {
  if (showControls) {
    return 'number';
  }
  return type === 'password' ? 'password' : variant;
}

function PasswordToggle({
  showPassword,
  onToggle,
  disabled,
  size,
}: {
  showPassword: boolean;
  onToggle: () => void;
  disabled: boolean;
  size: InputProps['size'];
}) {
  return (
    <InputEnd className="pointer-events-auto">
      <Button
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        aria-pressed={showPassword}
        disabled={disabled}
        onClick={onToggle}
        size={size === 'sm' ? 'icon-xs' : 'icon-sm'}
        type="button"
        variant="ghost"
      >
        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
      </Button>
    </InputEnd>
  );
}

function Input({
  className,
  type,
  showStepControls,
  step = 1,
  size,
  variant,
  appearance,
  textStyle,
  tone,
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

  const isNumberInput = type === 'number';
  const isPasswordInput = type === 'password';
  const shouldShowControls = isNumberInput && showStepControls === true;
  const locked = props.disabled === true || readOnly === true;
  // HTML defines no step lattice for `any`, so native stepUp/stepDown are unavailable.
  const stepControlsDisabled = locked || step === 'any';
  const inputVariant = isPasswordInput ? 'password' : variant;

  const { increment, decrement } = useNumberInputHandlers(inputRef);

  const inputType = isPasswordInput && showPassword ? 'text' : type;
  const layout = inputLayout(type, shouldShowControls, variant);

  const adornments = adornmentLayout(startWidth, endWidth);
  const measuredPadding: React.CSSProperties & {
    '--input-start-padding': string | undefined;
    '--input-end-padding': string | undefined;
  } = {
    '--input-start-padding': adornments.startPadding,
    '--input-end-padding': adornments.endPadding,
  };

  const inputElement = useRender({
    defaultTagName: 'input',
    ref: [inputRef, ref ?? null],
    props: {
      ...props,
      'aria-describedby': props['aria-describedby'] ?? fieldCtx.errorId,
      'aria-invalid': props['aria-invalid'] ?? (fieldCtx.invalid || undefined),
      className: cn(
        'rounded-md',
        inputVariants({ size, variant: inputVariant, appearance, textStyle, tone }),
        className,
        adornments.className
      ),
      'data-slot': 'input',
      ...(testId !== undefined && { 'data-testid': testId }),
      readOnly,
      step: isNumberInput ? step : undefined,
      type: inputType,
    } satisfies React.ComponentProps<'input'> & DataAttributes,
  });

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
        style={measuredPadding}
      >
        {inputElement}
        {children}
        {isPasswordInput ? (
          <PasswordToggle
            disabled={locked}
            onToggle={() => {
              setShowPassword(!showPassword);
            }}
            showPassword={showPassword}
            size={size}
          />
        ) : null}
        {shouldShowControls ? (
          <div className="flex flex-row gap-1">
            <Button
              aria-label="Increment value"
              className={stepControlVariants({ size })}
              disabled={stepControlsDisabled}
              onClick={increment}
              type="button"
              variant="outline"
            >
              <Plus />
            </Button>
            <Button
              aria-label="Decrement value"
              className={stepControlVariants({ size })}
              disabled={stepControlsDisabled}
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
} | null>(null);

const useInputContext = () => {
  const context = React.useContext(InputContext);
  if (context === null) {
    throw new Error('useInputContext must be used within an InputContextProvider');
  }
  return context;
};

const InputStart = ({
  children,
  className,
  ...props
}: {
  children: React.ReactNode;
  className?: string | undefined;
}) => {
  const { setStartWidth } = useInputContext();
  const startRef = React.useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = startRef.current;
    if (node === null) {
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

const InputEnd = ({ children, className, ...props }: { children: React.ReactNode; className?: string | undefined }) => {
  const { setEndWidth } = useInputContext();
  const endRef = React.useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = endRef.current;
    if (node === null) {
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

export interface ColorInputProps
  extends Omit<React.ComponentProps<'input'>, 'type' | 'children' | 'size'>,
    SharedProps {
  /** Swatch pickers sit over an already-painted proxy and reveal their native control on keyboard focus. */
  presentation?: 'native' | 'swatch' | undefined;
}

function ColorInput({ className, presentation = 'native', testId, ...props }: ColorInputProps) {
  return (
    <input
      {...props}
      className={cn(
        'cursor-pointer focus-visible:ring-3 focus-visible:ring-ring',
        presentation === 'swatch' && 'size-full opacity-0 focus-visible:opacity-100',
        className
      )}
      data-slot="color-input"
      {...(testId !== undefined && { 'data-testid': testId })}
      type="color"
    />
  );
}

export { ColorInput, Input, InputEnd, InputStart };
