// Copyright 2026 Redpanda Data, Inc.

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import { AnimatePresence, domMax, LazyMotion, type Transition } from 'motion/react';
import { div as MotionDiv } from 'motion/react-m';
import React from 'react';
import { useControllableState } from '../lib/use-controllable-state';
import { cn, type DataAttributes, type SharedProps } from '../lib/utils';
import { omitUndefined } from '../lib/utils/omit-undefined';
import { type Bounds, type RegisterHighlightItem, useParentHighlightLayout } from './motion-highlight/parent-highlight-layout';

type MotionHighlightMode = 'children' | 'parent';
const motionHighlightVariants = cva('', {
  variants: {
    variant: {
      default: 'bg-surface-subtle',
      row: 'pointer-events-none rounded-lg bg-accent',
      navigation: 'pointer-events-none rounded-md bg-sidebar-accent',
      'navigation-outline':
        'pointer-events-none rounded-md bg-sidebar-accent shadow-[0_0_0_1px_var(--color-sidebar-accent)]',
    },
  },
  defaultVariants: { variant: 'default' },
});
type MotionHighlightVariant = NonNullable<VariantProps<typeof motionHighlightVariants>['variant']>;

interface MotionHighlightContextType {
  activeClassName?: string | undefined;
  activeValue: string | null;
  className?: string | undefined;
  disabled?: boolean | undefined;
  enabled?: boolean | undefined;
  exitDelay?: number | undefined;
  forceUpdateBounds?: boolean | undefined;
  hover: boolean;
  id: string;
  mode: MotionHighlightMode;
  registerItem: RegisterHighlightItem;
  setActiveValue: (value: string | null) => void;
  transition?: Transition | undefined;
  variant: MotionHighlightVariant;
}

const MotionHighlightContext = React.createContext<MotionHighlightContextType | undefined>(undefined);

function useMotionHighlight(): MotionHighlightContextType {
  const context = React.useContext(MotionHighlightContext);
  if (context === undefined) {
    throw new Error('useMotionHighlight must be used within a MotionHighlightProvider');
  }
  return context;
}

type BaseMotionHighlightProps = SharedProps & {
  /** `row` is the rounded accent wash behind a disclosure or list row. */
  variant?: MotionHighlightVariant | undefined;
  mode?: MotionHighlightMode | undefined;
  value?: string | null | undefined;
  defaultValue?: string | null | undefined;
  onValueChange?: ((value: string | null) => void) | undefined;
  className?: string | undefined;
  transition?: Transition | undefined;
  hover?: boolean | undefined;
  disabled?: boolean | undefined;
  enabled?: boolean | undefined;
  exitDelay?: number | undefined;
};

interface ParentModeMotionHighlightProps {
  boundsOffset?: Partial<Bounds> | undefined;
  containerClassName?: string | undefined;
  forceUpdateBounds?: boolean | undefined;
}

type ParentMotionHighlightProps = BaseMotionHighlightProps &
  ParentModeMotionHighlightProps & {
    mode: 'parent';
    children: React.ReactNode;
  };

type ChildrenMotionHighlightProps = BaseMotionHighlightProps & {
  mode?: 'children' | undefined;
  children: React.ReactNode;
};

type MotionHighlightProps = React.ComponentProps<'div'> & (ParentMotionHighlightProps | ChildrenMotionHighlightProps);

interface ParentHighlightBackgroundProps {
  activeClassName: string;
  bounds: Bounds;
  className: string | undefined;
  exitDelay: number;
  transition: Transition;
  variant: MotionHighlightVariant;
}

function ParentHighlightBackground({
  activeClassName,
  bounds,
  className,
  exitDelay,
  transition,
  variant,
}: ParentHighlightBackgroundProps) {
  return (
    <MotionDiv
      animate={{ ...bounds, opacity: 1 }}
      className={cn('absolute z-0', motionHighlightVariants({ variant }), className, activeClassName)}
      data-slot="motion-highlight"
      exit={{ opacity: 0, transition: { ...transition, delay: (transition.delay ?? 0) + exitDelay } }}
      initial={{ ...bounds, opacity: 0 }}
      transition={transition}
    />
  );
}

function MotionHighlight(props: MotionHighlightProps) {
  const {
    children,
    value,
    defaultValue,
    onValueChange,
    className,
    transition = { type: 'spring', stiffness: 350, damping: 35 },
    hover = false,
    enabled = true,
    disabled = false,
    exitDelay = 0.2,
    mode = 'children',
    variant = 'default',
    testId,
    ref: forwardedRef,
  } = props;
  const parentBoundsOffset = props.mode === 'parent' ? props.boundsOffset : undefined;
  const parentContainerClassName = props.mode === 'parent' ? props.containerClassName : undefined;

  const localRef = React.useRef<HTMLDivElement>(null);

  const [activeValue, setActiveValue] = useControllableState<string | null>({
    defaultProp: defaultValue ?? null,
    ...omitUndefined({ onChange: onValueChange, prop: value }),
  });
  const { geometry, registerItem } = useParentHighlightLayout(localRef, {
    activeValue,
    boundsOffset: parentBoundsOffset,
    enabled,
    forceUpdateBounds: props.mode === 'parent' ? props.forceUpdateBounds : undefined,
    mode,
  });
  const id = React.useId();

  const containerProps: React.ComponentProps<'div'> & DataAttributes = {
    className: cn('relative', parentContainerClassName),
    'data-slot': 'motion-highlight-container',
    'data-testid': testId,
    children: (
      <>
        <AnimatePresence initial={false}>
          {geometry === null ? null : (
            <ParentHighlightBackground
              activeClassName={geometry.activeClassName}
              bounds={geometry.bounds}
              className={className}
              exitDelay={exitDelay}
              transition={transition}
              variant={variant}
            />
          )}
        </AnimatePresence>
        {children}
      </>
    ),
  };
  const container = useRender({
    defaultTagName: 'div',
    enabled: enabled && mode === 'parent',
    ref: [localRef, forwardedRef ?? null],
    props: { ...containerProps },
  });

  return (
    <LazyMotion features={domMax}>
      <MotionHighlightContext.Provider
        value={{
          mode,
          activeValue,
          setActiveValue,
          id,
          hover,
          className,
          transition,
          disabled,
          enabled,
          exitDelay,
          registerItem,
          activeClassName: geometry?.activeClassName,
          forceUpdateBounds: props.mode === 'parent' ? props.forceUpdateBounds : undefined,
          variant,
        }}
      >
        {enabled && mode === 'parent' ? container : children}
      </MotionHighlightContext.Provider>
    </LazyMotion>
  );
}

// Roles whose ARIA spec permits `aria-selected` (https://www.w3.org/TR/wai-aria-1.2/).
// The explicit item role belongs to its foreground, not its decorative wrapper.
// Ordinary buttons and links must not receive aria-selected merely because they
// have a visual highlight.
const ARIA_SELECTED_ROLES = new Set<string>([
  'columnheader',
  'gridcell',
  'option',
  'row',
  'rowheader',
  'tab',
  'treeitem',
]);

interface MotionHighlightItemState {
  active: boolean;
  disabled: boolean;
  value: string;
}

/** The item owns a decorative wrapper; render replaces only its foreground element. */
type MotionHighlightItemProps = React.ComponentProps<'div'> &
  SharedProps & {
    render?: useRender.RenderProp<MotionHighlightItemState> | undefined;
    value?: string | undefined;
    transition?: Transition | undefined;
    activeClassName?: string | undefined;
    disabled?: boolean | undefined;
    exitDelay?: number | undefined;
    forceUpdateBounds?: boolean | undefined;
    variant?: MotionHighlightVariant | undefined;
  };

function buildItemDataAttributes(active: boolean, disabled: boolean, value: string) {
  return {
    'data-active': active ? 'true' : 'false',
    'data-disabled': disabled ? true : undefined,
    'data-value': value,
    'data-highlight': disabled ? undefined : true,
  };
}

function MotionHighlightItemBackground({
  active,
  activeClassName,
  dataAttributes,
  exitDelay,
  transition,
}: {
  active: boolean;
  activeClassName: string | undefined;
  dataAttributes: ReturnType<typeof buildItemDataAttributes>;
  exitDelay: number | undefined;
  transition: Transition | undefined;
}) {
  const context = useMotionHighlight();
  if (context.mode !== 'children') {
    return null;
  }
  return (
    <AnimatePresence initial={false}>
      {active && (
        <MotionDiv
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'absolute inset-0 z-0',
            motionHighlightVariants({ variant: context.variant }),
            context.className,
            activeClassName
          )}
          data-slot="motion-highlight"
          exit={{
            opacity: 0,
            transition: {
              ...transition,
              delay: (transition?.delay ?? 0) + (exitDelay ?? context.exitDelay ?? 0),
            },
          }}
          initial={{ opacity: 0 }}
          layoutId={`transition-background-${context.id}`}
          {...omitUndefined({ transition })}
          {...dataAttributes}
        />
      )}
    </AnimatePresence>
  );
}

function itemInteractionHandlers(context: MotionHighlightContextType, value: string, disabled: boolean) {
  const canActivate = context.enabled === true && !disabled;
  const activate = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!(event.defaultPrevented || !canActivate)) {
      context.setActiveValue(value);
    }
  };
  const deactivate = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!(event.defaultPrevented || !canActivate)) {
      context.setActiveValue(null);
    }
  };
  return context.hover ? { onMouseEnter: activate, onMouseLeave: deactivate } : { onClick: activate };
}

function MotionHighlightItem({
  children,
  render,
  id,
  value,
  className,
  role,
  transition,
  disabled,
  activeClassName,
  variant,
  exitDelay,
  forceUpdateBounds,
  testId,
  ref: forwardedRef,
  onClick,
  onMouseEnter,
  onMouseLeave,
  ...props
}: MotionHighlightItemProps) {
  const context = useMotionHighlight();
  const itemId = React.useId();
  const childValue = value ?? id ?? itemId;
  const isDisabled = disabled ?? context.disabled ?? false;
  const isActive = context.activeValue === childValue && !isDisabled;
  const itemTransition = transition ?? context.transition;
  const highlightClassName = cn(motionHighlightVariants({ variant: variant ?? context.variant }), activeClassName);
  const registerWrapper = (wrapper: HTMLDivElement | null): (() => void) | undefined => {
    if (wrapper !== null && context.mode === 'parent') {
      return context.registerItem(wrapper, {
        value: childValue,
        disabled: isDisabled,
        activeClassName: highlightClassName,
        forceUpdateBounds,
      });
    }
    return undefined;
  };

  const dataAttributes = buildItemDataAttributes(isActive, isDisabled, childValue);
  const foregroundProps: React.ComponentProps<'div'> & DataAttributes = {
    children,
    role,
    ...(context.enabled === true ? dataAttributes : {}),
    'data-slot': context.enabled === true ? 'motion-highlight-item' : undefined,
    className: context.enabled === true ? 'relative z-[1]' : undefined,
    ...(role !== undefined && ARIA_SELECTED_ROLES.has(role) ? { 'aria-selected': isActive } : {}),
  };
  const foreground = useRender({
    defaultTagName: 'div',
    render,
    state: { active: isActive, disabled: isDisabled, value: childValue },
    stateAttributesMapping: {
      active: () => null,
      disabled: () => null,
      value: () => null,
    },
    props: mergeProps<'div'>(
      itemInteractionHandlers(context, childValue, isDisabled),
      { onClick, onMouseEnter, onMouseLeave },
      foregroundProps
    ),
  });

  const wrapperProps: React.ComponentProps<'div'> & DataAttributes = {
    ...dataAttributes,
    id,
    className: cn(context.mode === 'children' && 'relative', className),
    'data-slot': 'motion-highlight-item-container',
    'data-testid': testId,
    children: (
      <>
        <MotionHighlightItemBackground
          active={isActive}
          activeClassName={highlightClassName}
          dataAttributes={dataAttributes}
          exitDelay={exitDelay}
          transition={itemTransition}
        />
        {foreground}
      </>
    ),
  };
  const element = useRender({
    defaultTagName: 'div',
    enabled: context.enabled,
    ref: [registerWrapper, forwardedRef ?? null],
    props: mergeProps<'div'>(wrapperProps, props),
  });

  return context.enabled === true ? element : foreground;
}

export {
  MotionHighlight,
  MotionHighlightItem,
  type MotionHighlightItemProps,
  type MotionHighlightItemState,
  type MotionHighlightProps,
  useMotionHighlight,
};
