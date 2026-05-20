import React from 'react';

/**
 * Minimal local typings mirroring `@base-ui/react`'s public render-prop contract.
 * Kept self-contained so this file can be copied verbatim into consumer projects
 * without relying on Base UI's internal type paths.
 */
type HTMLPropsCompat<T = Element> = React.HTMLAttributes<T> & {
  ref?: React.Ref<T> | undefined;
};

type ComponentRenderFnCompat<Props, State> = (props: Props, state: State) => React.ReactElement<unknown>;

/**
 * Minimum structural shape we require from any prop bag passed to
 * `asChildToRender` — only the two fields we actually read. `render` is NOT
 * part of the constraint: it varies across Base UI primitives
 * (`DialogTrigger`, `PopoverTrigger`, `MenubarItem`, …), each with a
 * concrete `ComponentRenderFn<Props, State>` where `State` is primitive-
 * specific. Including a concrete `render` type here would force every caller
 * to widen their props to match ours, then re-narrow downstream — which is
 * exactly the round-trip TypeScript refuses at the spread site.
 *
 * By leaving `render` off the constraint and propagating the caller's `P`
 * through the generic bound, the returned prop bag keeps each primitive's
 * original `render` typing intact. No `any`, no casts at the call sites.
 */
type AsChildInput = {
  asChild?: boolean;
  children?: React.ReactNode;
};

/**
 * Translates Radix-style `asChild` prop to Base UI `render` prop.
 *
 * When `asChild={true}` and `children` is a valid element, returns `{ render: children }`.
 * Otherwise returns the input unchanged (minus `asChild`).
 *
 * Keeps the public API identical to Radix so consumers do not need to change code.
 *
 * Note: we pass the element form (not a function-form render) because Base UI's
 * `useRenderElement` calls `mergeProps(baseProps, element.props)` — with the
 * consumer's element props winning. Using the function form would bypass this
 * merge and force us to hand-roll prop precedence (including event handler
 * chaining), which is error-prone.
 */
export function asChildToRender<P extends AsChildInput>(props: P): Omit<P, 'asChild'> {
  const { asChild, children, ...rest } = props;
  if (asChild && React.isValidElement(children)) {
    // Drop `children` — Base UI uses `render` to mount the child element instead.
    // `rest` already omits it from the spread above.
    return { ...rest, render: children } as unknown as Omit<P, 'asChild'>;
  }
  return { ...rest, children } as Omit<P, 'asChild'>;
}

/**
 * Maps Base UI's primitive state to Radix-compat data-* attributes.
 * Shared across render helpers so every compat path emits identical attrs.
 */
function compatStateAttrs(state: CompatState | undefined): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (state && typeof state.open === 'boolean') {
    attrs['data-state'] = state.open ? 'open' : 'closed';
  }
  if (state && state.checked !== undefined) {
    if (state.checked === 'indeterminate') {
      attrs['data-state'] = 'indeterminate';
    } else if (typeof state.checked === 'boolean') {
      attrs['data-state'] = state.checked ? 'checked' : 'unchecked';
    }
  }
  if (state?.disabled) {
    attrs['data-disabled'] = '';
  }
  return attrs;
}

/**
 * Variant of `asChildToRender` for triggers of primitives whose default
 * rendered element is a `<button>` (Popover, Dialog, Menu, Menubar, Sheet…).
 *
 * Base UI's `nativeButton` flag defaults to `true`. When a consumer uses
 * `asChild` to supply a non-button DOM element (common pattern:
 * `<InputGroupAddon>`, `<Avatar>`, wrapping `<div>` / `<span>`), Base UI
 * emits a console error and the trigger misbehaves (missing role=button,
 * keyboard handlers). This helper inspects the child:
 *
 * - Native `<button>` → keep defaults (nativeButton stays true).
 * - Other intrinsic element (string type, e.g. `<div>`) → set
 *   `nativeButton={false}` so Base UI polyfills button semantics on it.
 * - Function / forwardRef component (e.g. our `<Button>`) → keep defaults.
 *   We cannot introspect what the component renders; assuming `<button>`
 *   matches the overwhelmingly common case (design-system button wrappers),
 *   avoiding a false positive warning when Base UI sees the rendered
 *   `<button>` and was told `nativeButton=false`. Consumers can always pass
 *   `nativeButton={false}` explicitly if their custom component renders a
 *   non-button element.
 */
export function asChildTrigger<P extends AsChildInput>(props: P): Omit<P, 'asChild'> & { nativeButton?: boolean } {
  const base = asChildToRender(props);
  if (!props.asChild) {
    return base;
  }
  const child = props.children;
  if (!React.isValidElement(child)) {
    return base;
  }
  if (rendersNonButton(child)) {
    return { ...base, nativeButton: false };
  }
  return base;
}

/**
 * Walks nested `asChild` chains to detect when the final rendered DOM element
 * is not a `<button>` — e.g. `<Button asChild><span>…</span></Button>`, which
 * wraps button styling around a `<span>` and therefore breaks the
 * `nativeButton` assumption.
 */
function rendersNonButton(element: React.ReactElement): boolean {
  if (typeof element.type === 'string') {
    return element.type !== 'button';
  }
  const props = (element.props ?? {}) as { asChild?: boolean; children?: React.ReactNode };
  if (!props.asChild) {
    // Function/forwardRef component without asChild: assume it renders a <button>.
    return false;
  }
  const inner = React.Children.count(props.children) === 1 ? React.Children.only(props.children) : null;
  return React.isValidElement(inner) ? rendersNonButton(inner) : false;
}

/**
 * State shapes exposed by Base UI primitives that are relevant for data-state compat.
 */
export type CompatState = {
  open?: boolean;
  checked?: boolean | 'indeterminate';
  disabled?: boolean;
};

/**
 * Produces a `render` prop that spreads element props and injects Radix-style
 * `data-state` attributes derived from Base UI component state.
 *
 * Radix exposes `data-state="open"|"closed"` / `data-state="checked"|"unchecked"`.
 * Base UI exposes `data-open`/`data-closed` / `data-checked`/`data-unchecked`.
 *
 * Consumer CSS commonly targets `data-[state=open]:...` selectors. This helper
 * forwards a compat attribute while keeping Base UI's native attrs intact.
 */
export function renderWithDataState<S extends CompatState = CompatState>(
  Element: keyof React.JSX.IntrinsicElements = 'div'
): ComponentRenderFnCompat<HTMLPropsCompat, S> {
  return (props, state) => React.createElement(Element, { ...props, ...compatStateAttrs(state) });
}

/**
 * Narrows Base UI's `onOpenChange(open, details)` signature to Radix's
 * `onOpenChange(open)` — so wrapper props can accept a single-arg callback
 * and forward it unchanged.
 */
export function narrowOpenChange<Details>(
  handler: ((open: boolean) => void) | undefined
): ((open: boolean, details: Details) => void) | undefined {
  if (!handler) {
    return;
  }
  return (open: boolean) => {
    handler(open);
  };
}

/**
 * Narrows any Base UI `(value, details) => void` callback to the single-arg
 * `(value) => void` shape expected by consumer code that was written against
 * Radix. Used for `onValueChange`, `onCheckedChange`, `onPressedChange`, etc.
 */
export function narrowCallback<Value, Details>(
  handler: ((value: Value) => void) | undefined
): ((value: Value, details: Details) => void) | undefined {
  if (!handler) {
    return;
  }
  return (value: Value) => {
    handler(value);
  };
}

/**
 * Base UI augments React.MouseEvent handlers with `preventBaseUIHandler`.
 * Wrapper components that want to accept a Radix-style `(event: React.MouseEvent) => void`
 * from consumers but pass it to a Base UI primitive can use this to keep the
 * public API typed without resorting to `any`.
 */
export type BaseUIMouseEvent<T = HTMLElement> = React.MouseEvent<T> & {
  preventBaseUIHandler: () => void;
  readonly baseUIHandlerPrevented?: boolean | undefined;
};

/**
 * Controlled/uncontrolled open-state mirror for wrapper components that gate
 * `AnimatePresence` on `isOpen`. Consolidates the `useState` + `useEffect` +
 * `useCallback` pattern that was copy-pasted across Popover, DropdownMenu,
 * HoverCard, Tooltip, Sheet, and ContextMenu.
 *
 * Returns the current mirrored `isOpen` plus a `handleOpenChange` that updates
 * local state and forwards to the consumer's callback.
 */
export function useMirroredOpen(
  controlledOpen: boolean | undefined,
  defaultOpen: boolean | undefined,
  onOpenChange: ((open: boolean) => void) | undefined
): { isOpen: boolean; handleOpenChange: (open: boolean) => void } {
  const [isOpen, setIsOpen] = React.useState<boolean>(controlledOpen ?? defaultOpen ?? false);

  React.useEffect(() => {
    if (controlledOpen !== undefined) {
      setIsOpen(controlledOpen);
    }
  }, [controlledOpen]);

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      setIsOpen(open);
      onOpenChange?.(open);
    },
    [onOpenChange]
  );

  return { isOpen, handleOpenChange };
}

type DescriptionRenderProps = {
  asChild?: boolean;
  children?: React.ReactNode;
  className?: string;
  fallbackClassName?: string;
  dataSlot?: string;
};

/**
 * Renders a Dialog/AlertDialog/Sheet Description as a `<div>` (instead of Base
 * UI's default `<p>`) so block-level children don't trigger validateDOMNesting.
 * In `asChild` mode, clones `data-slot` onto the user's element so the Radix
 * selector surface (`[data-slot="dialog-description"]`) keeps working.
 */
export function renderDescription({
  asChild,
  children,
  className,
  fallbackClassName = 'text-muted-foreground text-sm',
  dataSlot,
}: DescriptionRenderProps): React.ReactElement {
  if (asChild && React.isValidElement<{ 'data-slot'?: string }>(children)) {
    if (!dataSlot) {
      return children;
    }
    if (children.props['data-slot']) {
      return children;
    }
    return React.cloneElement(children, { 'data-slot': dataSlot });
  }
  const mergedClassName = [fallbackClassName, className].filter(Boolean).join(' ');
  return <div className={mergedClassName}>{children}</div>;
}

/**
 * Dev-only warning, deduped by key. Used to surface props that the compat layer
 * accepts for Radix API parity but cannot faithfully reproduce on Base UI
 * (e.g. `onOpenAutoFocus`, `forceMount`, `Accordion.collapsible`). Consumers
 * keep their code compiling; the lie is at least audible during development.
 */
const warnedKeys = new Set<string>();

export function devWarnOnce(key: string, message: string): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  if (warnedKeys.has(key)) {
    return;
  }
  warnedKeys.add(key);
  // biome-ignore lint/suspicious/noConsole: intentional dev-mode signal
  console.warn(`[redpanda-ui] ${message}`);
}

/**
 * Clears the internal dedup set used by `devWarnOnce`. The set is module-
 * scoped so it persists across tests in the same process, which means a
 * warning that fires in test A won't re-fire in test B even if the second
 * test genuinely expects it. Call this from `beforeEach` in any test suite
 * that asserts on warning output. Wired into the registry's `vitest.setup.ts`.
 */
export function resetDevWarnings(): void {
  warnedKeys.clear();
}

/**
 * Fires a dev-only deprecation warning the first time a Radix-compat prop is
 * passed. Pair with a JSDoc `@deprecated` tag on the prop type so both the
 * IDE and the runtime surface the guidance. Message format matches the
 * compat docs: says what the prop was, what to use instead, and when the
 * shim will go away.
 *
 * Usage:
 *   warnDeprecatedProp('DialogContent', 'onOpenAutoFocus', onOpenAutoFocus,
 *     'Use `initialFocus` on Base UI `Popup` instead.');
 */
export function warnDeprecatedProp(component: string, prop: string, value: unknown, guidance: string): void {
  if (value === undefined) {
    return;
  }
  devWarnOnce(
    `${component}:${prop}`,
    `<${component}> \`${prop}\` is a Radix-compat shim scheduled for removal. ${guidance}`
  );
}

/**
 * Radix's `forceMount` on a Content/Panel component maps to Base UI's
 * `keepMounted` on the surrounding Portal. Use at a Content wrapper to
 * accept `forceMount` for source-compat, forward it to `keepMounted`, and
 * emit a dev-mode deprecation pointing consumers at the native prop.
 *
 * Returns the value to pass to the Portal's `keepMounted` prop. Preserves an
 * explicit `keepMounted` if the caller passed one; `forceMount` only ever
 * escalates (never downgrades) the mount mode.
 */
export function resolveKeepMounted(
  component: string,
  forceMount: boolean | undefined,
  keepMounted: boolean | undefined
): boolean | undefined {
  if (forceMount) {
    warnDeprecatedProp(
      component,
      'forceMount',
      forceMount,
      'Use `keepMounted` on the underlying Portal instead (already forwarded by this component).'
    );
    return true;
  }
  return keepMounted;
}

/* -------------------------------------------------------------------------------------------------
 * Slot + Slottable
 *
 * Reimplementation of the Radix `Slot` pattern so consumer projects get a
 * registry:lib copy alongside their components, without an extra npm dep.
 * Behavior: className / style merging, ordered event-handler chaining
 * (child handler first — return value preserved), ref composition, and
 * `Slottable` for asChild composition with siblings. Inspired by
 * @radix-ui/react-slot.
 * -----------------------------------------------------------------------------------------------*/

type SlotProps = {
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>;

type SlotElement = React.ReactElement & { ref?: React.Ref<HTMLElement> };

type EventHandler = (...args: unknown[]) => unknown;

function isEventHandlerKey(key: string): boolean {
  return /^on[A-Z]/.test(key);
}

function readHandler(source: object, key: string): EventHandler | undefined {
  const value = Reflect.get(source, key);
  return typeof value === 'function' ? (value as EventHandler) : undefined;
}

function readString(source: object, key: string): string | undefined {
  const value = Reflect.get(source, key);
  return typeof value === 'string' ? value : undefined;
}

function readStyle(source: object): React.CSSProperties | undefined {
  const value = Reflect.get(source, 'style');
  return value && typeof value === 'object' ? (value as React.CSSProperties) : undefined;
}

function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>): React.RefCallback<T> {
  return (value: T) => {
    for (const ref of refs) {
      if (!ref) {
        continue;
      }
      if (typeof ref === 'function') {
        ref(value);
      } else {
        (ref as React.MutableRefObject<T>).current = value;
      }
    }
  };
}

function getElementRef(element: React.ReactElement): React.Ref<unknown> | undefined {
  // React 19 exposes ref as a prop; React <=18 exposes it on the element.
  const refFromProps = Reflect.get(element.props as object, 'ref');
  if (refFromProps !== undefined) {
    return refFromProps as React.Ref<unknown>;
  }
  return (element as SlotElement).ref;
}

function mergeSlotProps(slotProps: object, childProps: object): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...slotProps, ...childProps };

  const slotClass = readString(slotProps, 'className');
  const childClass = readString(childProps, 'className');
  if (slotClass || childClass) {
    merged.className = [slotClass, childClass].filter(Boolean).join(' ');
  }

  const slotStyle = readStyle(slotProps);
  const childStyle = readStyle(childProps);
  if (slotStyle || childStyle) {
    merged.style = { ...(slotStyle ?? {}), ...(childStyle ?? {}) };
  }

  for (const key of Object.keys(slotProps)) {
    if (!isEventHandlerKey(key)) {
      continue;
    }
    const slotHandler = readHandler(slotProps, key);
    const childHandler = readHandler(childProps, key);
    if (slotHandler && childHandler) {
      merged[key] = (...args: unknown[]) => {
        const result = childHandler(...args);
        slotHandler(...args);
        return result;
      };
    } else if (slotHandler) {
      merged[key] = slotHandler;
    }
  }

  return merged;
}

type SlotCloneProps = {
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>;

const SlotClone = React.forwardRef<HTMLElement, SlotCloneProps>(function SlotClone(props, forwardedRef) {
  const { children, ...slotProps } = props;

  if (!React.isValidElement(children)) {
    if (React.Children.count(children) > 1) {
      return React.Children.only(null);
    }
    return null;
  }

  const element = children as SlotElement;
  const childProps = element.props as object;
  const merged = mergeSlotProps(slotProps, childProps);
  const childRef = getElementRef(element) as React.Ref<HTMLElement> | undefined;
  merged.ref = forwardedRef ? composeRefs(forwardedRef, childRef) : childRef;
  return React.cloneElement(element, merged);
});

const SLOTTABLE_IDENTIFIER = Symbol.for('redpanda.slottable');

type SlottableComponent = React.FC<{ children: React.ReactNode }> & { __slottableId: symbol };

export const Slottable: SlottableComponent = Object.assign(
  function Slottable({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  },
  { __slottableId: SLOTTABLE_IDENTIFIER }
);
Slottable.displayName = 'Slottable';

function isSlottable(child: React.ReactNode): child is React.ReactElement<{ children: React.ReactNode }> {
  if (!React.isValidElement(child)) {
    return false;
  }
  const type = child.type as { __slottableId?: symbol } | string;
  return typeof type !== 'string' && type.__slottableId === SLOTTABLE_IDENTIFIER;
}

export const Slot = React.forwardRef<HTMLElement, SlotProps>(function Slot(props, forwardedRef) {
  const { children, ...slotProps } = props;
  const childrenArray = React.Children.toArray(children);
  const slottable = childrenArray.find(isSlottable);

  if (slottable) {
    const target = slottable.props.children;
    const siblings = childrenArray.map((child) => {
      if (child !== slottable) {
        return child;
      }
      if (React.Children.count(target) > 1) {
        return React.Children.only(null);
      }
      return React.isValidElement<{ children?: React.ReactNode }>(target) ? target.props.children : null;
    });

    return (
      <SlotClone {...slotProps} ref={forwardedRef}>
        {React.isValidElement(target) ? React.cloneElement(target, undefined, siblings) : null}
      </SlotClone>
    );
  }

  return (
    <SlotClone {...slotProps} ref={forwardedRef}>
      {children}
    </SlotClone>
  );
});
Slot.displayName = 'Slot';
