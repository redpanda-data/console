import { AnimatePresence, motion, type Transition } from 'motion/react';
import React from 'react';

import { cn, type SharedProps } from '../lib/utils';

type MotionHighlightMode = 'children' | 'parent';

type Bounds = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type MotionHighlightContextType<T extends string> = {
  mode: MotionHighlightMode;
  activeValue: T | null;
  setActiveValue: (value: T | null) => void;
  setBounds: (bounds: DOMRect) => void;
  clearBounds: () => void;
  id: string;
  hover: boolean;
  className?: string;
  activeClassName?: string;
  setActiveClassName: (className: string) => void;
  transition?: Transition;
  disabled?: boolean;
  enabled?: boolean;
  exitDelay?: number;
  forceUpdateBounds?: boolean;
};

const MotionHighlightContext = React.createContext<MotionHighlightContextType<string> | undefined>(undefined);

function useMotionHighlight<T extends string>(): MotionHighlightContextType<T> {
  const context = React.useContext(MotionHighlightContext);
  if (!context) {
    throw new Error('useMotionHighlight must be used within a MotionHighlightProvider');
  }
  return context as unknown as MotionHighlightContextType<T>;
}

type BaseMotionHighlightProps<T extends string> = SharedProps & {
  mode?: MotionHighlightMode;
  value?: T | null;
  defaultValue?: T | null;
  onValueChange?: (value: T | null) => void;
  className?: string;
  transition?: Transition;
  hover?: boolean;
  disabled?: boolean;
  enabled?: boolean;
  exitDelay?: number;
};

type ParentModeMotionHighlightProps = {
  boundsOffset?: Partial<Bounds>;
  containerClassName?: string;
  forceUpdateBounds?: boolean;
};

type ControlledParentModeMotionHighlightProps<T extends string> = BaseMotionHighlightProps<T> &
  ParentModeMotionHighlightProps & {
    mode: 'parent';
    controlledItems: true;
    children: React.ReactNode;
  };

type ControlledChildrenModeMotionHighlightProps<T extends string> = BaseMotionHighlightProps<T> & {
  mode?: 'children' | undefined;
  controlledItems: true;
  children: React.ReactNode;
};

type UncontrolledParentModeMotionHighlightProps<T extends string> = BaseMotionHighlightProps<T> &
  ParentModeMotionHighlightProps & {
    mode: 'parent';
    controlledItems?: false;
    itemsClassName?: string;
    children: React.ReactElement | React.ReactElement[];
  };

type UncontrolledChildrenModeMotionHighlightProps<T extends string> = BaseMotionHighlightProps<T> & {
  mode?: 'children';
  controlledItems?: false;
  itemsClassName?: string;
  children: React.ReactElement | React.ReactElement[];
};

type MotionHighlightProps<T extends string> = React.ComponentProps<'div'> &
  (
    | ControlledParentModeMotionHighlightProps<T>
    | ControlledChildrenModeMotionHighlightProps<T>
    | UncontrolledParentModeMotionHighlightProps<T>
    | UncontrolledChildrenModeMotionHighlightProps<T>
  );

function MotionHighlight<T extends string>(props: MotionHighlightProps<T>) {
  const {
    children,
    value,
    defaultValue,
    onValueChange,
    className,
    transition = { type: 'spring', stiffness: 350, damping: 35 },
    hover = false,
    enabled = true,
    controlledItems,
    disabled = false,
    exitDelay = 0.2,
    mode = 'children',
    testId,
  } = props;

  const localRef = React.useRef<HTMLDivElement>(null);

  const [activeValue, setActiveValue] = React.useState<string | null>(value ?? defaultValue ?? null);
  const [boundsState, setBoundsState] = React.useState<Bounds | null>(null);
  const [activeClassNameState, setActiveClassNameState] = React.useState<string>('');

  const safeSetActiveValue = React.useCallback(
    (newId: string | null) => {
      setActiveValue((prev) => (prev === newId ? prev : newId));
      if (newId !== activeValue) {
        onValueChange?.(newId as T);
      }
    },
    [activeValue, onValueChange]
  );

  const safeSetBounds = React.useCallback(
    (bounds: DOMRect) => {
      if (!localRef.current) {
        return;
      }

      const boundsOffset = (props as ParentModeMotionHighlightProps)?.boundsOffset ?? {
        top: 0,
        left: 0,
        width: 0,
        height: 0,
      };

      const containerRect = localRef.current.getBoundingClientRect();
      const newBounds: Bounds = {
        top: bounds.top - containerRect.top + (boundsOffset.top ?? 0),
        left: bounds.left - containerRect.left + (boundsOffset.left ?? 0),
        width: bounds.width + (boundsOffset.width ?? 0),
        height: bounds.height + (boundsOffset.height ?? 0),
      };

      setBoundsState((prev) => {
        if (
          prev &&
          prev.top === newBounds.top &&
          prev.left === newBounds.left &&
          prev.width === newBounds.width &&
          prev.height === newBounds.height
        ) {
          return prev;
        }
        return newBounds;
      });
    },
    [props]
  );

  const clearBounds = React.useCallback(() => {
    setBoundsState((prev) => (prev === null ? prev : null));
  }, []);

  React.useEffect(() => {
    if (value !== undefined) {
      setActiveValue(value);
    } else if (defaultValue !== undefined) {
      setActiveValue(defaultValue);
    }
  }, [value, defaultValue]);

  const id = React.useId();

  React.useEffect(() => {
    if (mode !== 'parent') {
      return;
    }
    const container = localRef.current;
    if (!container) {
      return;
    }

    const onScroll = () => {
      if (!activeValue) {
        return;
      }
      const activeEl = container.querySelector<HTMLElement>(`[data-value="${activeValue}"][data-highlight="true"]`);
      if (activeEl) {
        safeSetBounds(activeEl.getBoundingClientRect());
      }
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [mode, activeValue, safeSetBounds]);

  const render = React.useCallback(
    (renderedChildren: React.ReactNode) => {
      if (mode === 'parent') {
        return (
          <div
            className={cn('relative', (props as ParentModeMotionHighlightProps)?.containerClassName)}
            data-slot="motion-highlight-container"
            data-testid={testId}
            ref={localRef}
          >
            <AnimatePresence initial={false}>
              {boundsState ? (
                <motion.div
                  animate={{
                    top: boundsState.top,
                    left: boundsState.left,
                    width: boundsState.width,
                    height: boundsState.height,
                    opacity: 1,
                  }}
                  className={cn('absolute z-0 bg-muted', className, activeClassNameState)}
                  data-slot="motion-highlight"
                  exit={{
                    opacity: 0,
                    transition: {
                      ...transition,
                      delay: (transition?.delay ?? 0) + (exitDelay ?? 0),
                    },
                  }}
                  initial={{
                    top: boundsState.top,
                    left: boundsState.left,
                    width: boundsState.width,
                    height: boundsState.height,
                    opacity: 0,
                  }}
                  transition={transition}
                />
              ) : null}
            </AnimatePresence>
            {renderedChildren}
          </div>
        );
      }

      return renderedChildren;
    },
    [mode, props, boundsState, transition, exitDelay, className, activeClassNameState, testId]
  );

  return (
    <MotionHighlightContext.Provider
      value={{
        mode,
        activeValue,
        setActiveValue: safeSetActiveValue,
        id,
        hover,
        className,
        transition,
        disabled,
        enabled,
        exitDelay,
        setBounds: safeSetBounds,
        clearBounds,
        activeClassName: activeClassNameState,
        setActiveClassName: setActiveClassNameState,
        forceUpdateBounds: (props as ParentModeMotionHighlightProps)?.forceUpdateBounds,
      }}
    >
      {enabled && controlledItems ? render(children) : null}
      {enabled && !controlledItems
        ? render(
            React.Children.map(children, (child) => (
              <MotionHighlightItem className={props?.itemsClassName} key={child.key || Math.random()}>
                {child}
              </MotionHighlightItem>
            ))
          )
        : null}
      {/* biome-ignore lint/nursery/noLeakedRender: enabled is always boolean, safe to use in ternary */}
      {enabled ? null : children}
    </MotionHighlightContext.Provider>
  );
}

function getNonOverridingDataAttributes(
  element: React.ReactElement,
  dataAttributes: Record<string, unknown>
): Record<string, unknown> {
  return Object.keys(dataAttributes).reduce<Record<string, unknown>>((acc, key) => {
    if ((element.props as Record<string, unknown>)[key] === undefined) {
      acc[key] = dataAttributes[key];
    }
    return acc;
  }, {});
}

type ExtendedChildProps = React.ComponentProps<'div'> & {
  id?: string;
  'data-active'?: string;
  'data-value'?: string;
  'data-disabled'?: boolean;
  'data-highlight'?: boolean;
  'data-slot'?: string;
};

type MotionHighlightItemProps = React.ComponentProps<'div'> &
  SharedProps & {
    children: React.ReactElement;
    id?: string;
    value?: string;
    className?: string;
    transition?: Transition;
    activeClassName?: string;
    disabled?: boolean;
    exitDelay?: number;
    asChild?: boolean;
    forceUpdateBounds?: boolean;
  };

function useMotionHighlightItemLogic(options: {
  id?: string;
  value?: string;
  disabled?: boolean;
  transition?: Transition;
  children?: React.ReactElement;
}) {
  const { id, value, disabled, transition, children } = options;
  const itemId = React.useId();
  const context = useMotionHighlight();
  const element = children as React.ReactElement<ExtendedChildProps>;
  const childValue = id ?? value ?? element.props?.['data-value'] ?? element.props?.id ?? itemId;
  const isActive = context.activeValue === childValue;
  const isDisabled = disabled === undefined ? context.disabled : disabled;
  const itemTransition = transition ?? context.transition;

  return {
    ...context,
    element,
    childValue,
    isActive,
    isDisabled,
    itemTransition,
    itemId,
  };
}

const MotionHighlightItem = React.forwardRef<HTMLDivElement, MotionHighlightItemProps>(
  (
    {
      children,
      id,
      value,
      className,
      transition,
      disabled = false,
      activeClassName,
      exitDelay,
      asChild = false,
      forceUpdateBounds,
      testId,
      ...props
    },
    forwardedRef
  ) => {
    const {
      activeValue,
      setActiveValue,
      mode,
      setBounds,
      clearBounds,
      hover,
      enabled,
      className: contextClassName,
      id: contextId,
      exitDelay: contextExitDelay,
      forceUpdateBounds: contextForceUpdateBounds,
      setActiveClassName,
      element,
      childValue,
      isActive,
      isDisabled,
      itemTransition,
    } = useMotionHighlightItemLogic({ id, value, disabled, transition, children });

    const localRef = React.useRef<HTMLDivElement>(null);

    // Use imperative handle to properly forward the ref
    React.useImperativeHandle(forwardedRef, () => localRef.current as HTMLDivElement, []);

    React.useEffect(() => {
      if (mode !== 'parent') {
        return;
      }
      let rafId: number;
      let previousBounds: Bounds | null = null;
      const shouldUpdateBounds =
        forceUpdateBounds === true || (contextForceUpdateBounds && forceUpdateBounds !== false);

      const updateBounds = () => {
        if (!localRef.current) {
          return;
        }

        const bounds = localRef.current.getBoundingClientRect();

        if (shouldUpdateBounds) {
          if (
            previousBounds &&
            previousBounds.top === bounds.top &&
            previousBounds.left === bounds.left &&
            previousBounds.width === bounds.width &&
            previousBounds.height === bounds.height
          ) {
            rafId = requestAnimationFrame(updateBounds);
            return;
          }
          previousBounds = bounds;
          rafId = requestAnimationFrame(updateBounds);
        }

        setBounds(bounds);
      };

      if (isActive) {
        updateBounds();
        setActiveClassName(activeClassName ?? '');
      } else if (!activeValue) {
        clearBounds();
      }

      if (shouldUpdateBounds) {
        return () => cancelAnimationFrame(rafId);
      }
    }, [
      mode,
      isActive,
      activeValue,
      setBounds,
      clearBounds,
      activeClassName,
      setActiveClassName,
      forceUpdateBounds,
      contextForceUpdateBounds,
    ]);

    if (!React.isValidElement(children)) {
      return children;
    }

    const dataAttributes = {
      'data-active': isActive ? 'true' : 'false',
      'aria-selected': isActive,
      'data-disabled': isDisabled,
      'data-value': childValue,
      'data-highlight': true,
    };

    const commonHandlers = hover
      ? {
          onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
            setActiveValue(childValue);
            element.props.onMouseEnter?.(e);
          },
          onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
            setActiveValue(null);
            element.props.onMouseLeave?.(e);
          },
        }
      : {
          onClick: (e: React.MouseEvent<HTMLDivElement>) => {
            setActiveValue(childValue);
            element.props.onClick?.(e);
          },
        };

    if (asChild) {
      if (mode === 'children') {
        return React.cloneElement(
          element,
          {
            key: childValue,
            ref: localRef,
            className: cn('relative', element.props.className),
            ...getNonOverridingDataAttributes(element, {
              ...dataAttributes,
              'data-slot': 'motion-highlight-item-container',
            }),
            ...commonHandlers,
            ...props,
          },
          <>
            <AnimatePresence initial={false}>
              {isActive && !isDisabled && (
                <motion.div
                  animate={{ opacity: 1 }}
                  className={cn('absolute inset-0 z-0 bg-muted', contextClassName, activeClassName)}
                  data-slot="motion-highlight"
                  exit={{
                    opacity: 0,
                    transition: {
                      ...itemTransition,
                      delay: (itemTransition?.delay ?? 0) + (exitDelay ?? contextExitDelay ?? 0),
                    },
                  }}
                  initial={{ opacity: 0 }}
                  layoutId={`transition-background-${contextId}`}
                  transition={itemTransition}
                  {...dataAttributes}
                />
              )}
            </AnimatePresence>

            <div className={cn('relative z-[1]', className)} data-slot="motion-highlight-item" {...dataAttributes}>
              {children}
            </div>
          </>
        );
      }

      return React.cloneElement(element, {
        ref: localRef,
        ...getNonOverridingDataAttributes(element, {
          ...dataAttributes,
          'data-slot': 'motion-highlight-item',
        }),
        ...commonHandlers,
      });
    }

    return enabled ? (
      <div
        className={cn(mode === 'children' && 'relative', className)}
        data-slot="motion-highlight-item-container"
        key={childValue}
        ref={localRef}
        {...dataAttributes}
        {...props}
        {...commonHandlers}
        data-testid={testId}
      >
        {mode === 'children' && (
          <AnimatePresence initial={false}>
            {isActive && !isDisabled && (
              <motion.div
                animate={{ opacity: 1 }}
                className={cn('absolute inset-0 z-0 bg-muted', contextClassName, activeClassName)}
                data-slot="motion-highlight"
                exit={{
                  opacity: 0,
                  transition: {
                    ...itemTransition,
                    delay: (itemTransition?.delay ?? 0) + (exitDelay ?? contextExitDelay ?? 0),
                  },
                }}
                initial={{ opacity: 0 }}
                layoutId={`transition-background-${contextId}`}
                transition={itemTransition}
                {...dataAttributes}
              />
            )}
          </AnimatePresence>
        )}

        {React.cloneElement(element, {
          className: cn('relative z-[1]', element.props.className),
          ...getNonOverridingDataAttributes(element, {
            ...dataAttributes,
            'data-slot': 'motion-highlight-item',
          }),
        })}
      </div>
    ) : (
      children
    );
  }
);

MotionHighlightItem.displayName = 'MotionHighlightItem';

export {
  MotionHighlight,
  MotionHighlightItem,
  useMotionHighlight,
  type MotionHighlightProps,
  type MotionHighlightItemProps,
};
