'use client';

import { useRender } from '@base-ui/react/use-render';
import type { VariantProps } from 'class-variance-authority';
import { ChevronRight, SearchIcon } from 'lucide-react';
import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog';
import { Popover, PopoverAnchor, PopoverContent } from './popover';
import { hasSlotContent } from '../lib/has-slot-content';
import { cn, type DataAttributes, type FixedPositionContentProps, type SharedProps } from '../lib/utils';
import { omitUndefined } from '../lib/utils/omit-undefined';
import {
  isComposingKey,
  itemValueOf,
  movesHighlight,
  navigationIntent,
  navigationTarget,
  RANKED_GROUP_ROW_SELECTOR,
  RANKED_ITEM_ROW_SELECTOR,
  type ReconciledItems,
  textFromNode,
  useRankedWrapper,
} from './command/navigation';
import {
  type CommandFilter,
  type CommandStore,
  createCommandStore,
  defaultCommandFilter,
  navigableItems,
  ownsKeyboardTarget,
  scrollItemIntoList,
  scrollItemIntoView,
} from './command/store';
import { commandVariants } from './command/variants';

/**
 * cmdk's DOM attributes. The parts keep them so selectors written against cmdk —
 * `[cmdk-input]`, `[cmdk-item][aria-selected="true"]`, `[cmdk-group-heading]` — keep matching.
 */
type CommandDomAttributes = Partial<Record<`cmdk-${string}`, ''>>;

const cmdkAttributes = {
  empty: { 'cmdk-empty': '' },
  group: { 'cmdk-group': '' },
  groupHeading: { 'cmdk-group-heading': '' },
  groupItems: { 'cmdk-group-items': '' },
  input: { 'cmdk-input': '' },
  item: { 'cmdk-item': '' },
  label: { 'cmdk-label': '' },
  list: { 'cmdk-list': '' },
  listSizer: { 'cmdk-list-sizer': '' },
  root: { 'cmdk-root': '' },
  separator: { 'cmdk-separator': '' },
} as const satisfies Record<string, CommandDomAttributes>;

/** Rank order while searching. Items and groups sit in flex columns, so `order` re-ranks them without moving DOM nodes. */
type RankStyle = React.CSSProperties & { '--cmdk-order': number | undefined };

interface CommandContextValue {
  disablePointerSelection: boolean;
  filter: CommandFilter;
  inputId: string;
  labelId: string | undefined;
  listId: string;
  shouldFilter: boolean;
  store: CommandStore;
}

interface CommandGroupContextValue {
  forceMount: boolean;
  id: string;
}

const CommandContext = React.createContext<CommandContextValue | null>(null);
const CommandGroupContext = React.createContext<CommandGroupContextValue | undefined>(undefined);

function useCommandContext(part: string): CommandContextValue {
  const context = React.useContext(CommandContext);
  if (context === null) {
    throw new Error(`<${part}> must be rendered inside <Command>.`);
  }
  return context;
}

function useCommandStore<T>(store: CommandStore, selector: (store: CommandStore) => T): T {
  const read = () => selector(store);
  return React.useSyncExternalStore(store.subscribe, read, read);
}

/** The command state `useCommandState` exposes, matching the cmdk fields consumers read. */
interface CommandState {
  filtered: { count: number };
  search: string;
  selectedItemId: string | undefined;
  value: string;
}

const commandStates = new WeakMap<CommandStore, CommandState>();

/** One state object per change, so a selector that returns `filtered` or the whole state stays stable, as in cmdk. */
function commandStateOf(store: CommandStore): CommandState {
  const count = store.getVisibleCount();
  const search = store.getSearch();
  const selectedItemId = store.getSelectedId();
  const value = store.getValue();
  const cached = commandStates.get(store);
  if (
    cached?.filtered.count === count &&
    cached.search === search &&
    cached.selectedItemId === selectedItemId &&
    cached.value === value
  ) {
    return cached;
  }
  const state: CommandState = { filtered: { count }, search, selectedItemId, value };
  commandStates.set(store, state);
  return state;
}

/** Reads the enclosing command's state, as cmdk's hook of the same name did. Return a primitive or a stable value. */
function useCommandState<T>(selector: (state: CommandState) => T): T {
  const { store } = useCommandContext('useCommandState');
  return useCommandStore(store, (state) => selector(commandStateOf(state)));
}

interface CommandSelectionSyncProps {
  autoHighlight: boolean;
  onValueChange: ((value: string) => void) | undefined;
  ranked: boolean;
  rootRef: React.RefObject<HTMLElement | null>;
  store: CommandStore;
  value: string | undefined;
}

/**
 * Rendered after the command's children, so its layout effect sees their committed DOM. It
 * publishes each commit's item changes in one notification, then reconciles the highlight on the
 * next pass: typing highlights the first match, and a highlight whose item disappears moves to the
 * first item. With `autoHighlight` off the highlight is left to the caller.
 */
function CommandSelectionSync({
  autoHighlight,
  onValueChange,
  ranked,
  rootRef,
  store,
  value,
}: CommandSelectionSyncProps) {
  const search = useCommandStore(store, (state) => state.getSearch());
  const itemsVersion = useCommandStore(store, (state) => state.getItemsVersion());
  const [, requestFlush] = React.useReducer((count: number) => count + 1, 0);
  const reconciled = React.useRef<ReconciledItems>({ itemsVersion: -1, search, values: new Set() });

  React.useLayoutEffect(() => {
    store.setOptions({ controlled: value !== undefined, onValueChange, ranked, requestFlush });
    if (value !== undefined) {
      store.syncValue(value.trim());
    }
    if (store.flush()) {
      // React subscribes to the store after paint, so a mount's first notification reaches no one and the
      // first frame would show the empty state beside the items. An update from this layout effect renders
      // before paint, and React runs those subscriptions first, as cmdk's layout-effect state update did.
      requestFlush();
      return;
    }
    const previous = reconciled.current;
    if (previous.itemsVersion === itemsVersion && previous.search === search) {
      return;
    }
    const items = navigableItems(store, rootRef.current);
    const next: ReconciledItems = {
      itemsVersion,
      search,
      values: new Set(items.map((item) => itemValueOf(item) ?? '')),
    };
    reconciled.current = next;
    if (!(autoHighlight && movesHighlight(previous, next, store.getValue()))) {
      return;
    }
    const first = items[0];
    store.setValue(itemValueOf(first) ?? '');
    if (previous.search !== search && first !== undefined) {
      scrollItemIntoList(store, first);
    }
  });

  return null;
}

interface CommandProps
  extends Omit<React.ComponentProps<'div'>, 'defaultValue'>,
    VariantProps<typeof commandVariants>,
    SharedProps {
  /**
   * Highlights the first item when the highlight is empty or the search changes, and moves a highlight whose item
   * disappears, as cmdk does. `false` leaves the highlight to the caller, for lists that drive it themselves, such as
   * virtualised ones.
   */
  autoHighlight?: boolean | undefined;
  /** Highlighted item value when uncontrolled. */
  defaultValue?: string | undefined;
  /** Keeps the pointer from moving the highlight; clicks still select. */
  disablePointerSelection?: boolean | undefined;
  /** Scores an item against the search. Zero hides it; higher scores rank first. Defaults to case-insensitive, in-order character matching. */
  filter?: CommandFilter | undefined;
  /** Accessible name for the search input, rendered as a visually hidden label. */
  label?: string | undefined;
  /** Wraps keyboard navigation from the last item to the first, and back. */
  loop?: boolean | undefined;
  onValueChange?: ((value: string) => void) | undefined;
  /** `false` leaves filtering and ordering to the caller, for server-side or async results. */
  shouldFilter?: boolean | undefined;
  /** Highlighted item value when controlled. */
  value?: string | undefined;
  /** Ctrl+N/J and Ctrl+P/K move the highlight. */
  vimBindings?: boolean | undefined;
}

function Command({
  className,
  variant,
  size,
  testId,
  label,
  shouldFilter = true,
  filter = defaultCommandFilter,
  defaultValue,
  value,
  onValueChange,
  loop = false,
  autoHighlight = true,
  disablePointerSelection = false,
  vimBindings = true,
  onKeyDown,
  children,
  ref,
  ...props
}: CommandProps) {
  const [store] = React.useState(() => createCommandStore((value ?? defaultValue ?? '').trim()));
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const id = React.useId();
  const labelId = label === undefined || label === '' ? undefined : `${id}-label`;
  const inputId = `${id}-input`;
  const context: CommandContextValue = {
    disablePointerSelection,
    filter,
    inputId,
    labelId,
    listId: `${id}-list`,
    shouldFilter,
    store,
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || isComposingKey(event) || !ownsKeyboardTarget(store, rootRef.current, event.target)) {
      return;
    }
    const intent = navigationIntent(event, vimBindings);
    if (intent === undefined) {
      return;
    }
    // Enter is consumed even without a highlight, so a command inside a form never submits it.
    event.preventDefault();
    const target = navigationTarget(store, rootRef.current, intent, loop);
    if (target === undefined) {
      return;
    }
    if (intent === 'select') {
      // Selection, not a synthetic click: the item's onClick and clickable ancestors stay out of it, as in cmdk.
      store.select(target.id);
      return;
    }
    store.setValue(itemValueOf(target) ?? '');
    scrollItemIntoView(target);
  };

  const root = useRender({
    defaultTagName: 'div',
    ref: [rootRef, ref ?? null],
    props: {
      'data-slot': 'command',
      'data-testid': testId,
      tabIndex: -1,
      ...props,
      ...cmdkAttributes.root,
      className: cn(commandVariants({ variant, size }), className),
      onKeyDown: handleKeyDown,
      children: (
        <>
          {labelId === undefined ? null : (
            <label {...cmdkAttributes.label} className="sr-only" htmlFor={inputId} id={labelId}>
              {label}
            </label>
          )}
          <CommandGroupContext.Provider value={undefined}>{children}</CommandGroupContext.Provider>
          <CommandSelectionSync
            autoHighlight={autoHighlight}
            onValueChange={onValueChange}
            ranked={shouldFilter}
            rootRef={rootRef}
            store={store}
            value={value}
          />
        </>
      ),
    } satisfies React.ComponentProps<'div'> & DataAttributes & CommandDomAttributes,
  });

  return <CommandContext.Provider value={context}>{root}</CommandContext.Provider>;
}

function CommandDialog({
  title = 'Command Palette',
  description = 'Search for a command to run...',
  children,
  showOverlay = true,
  // shadcn defaults this to false; we keep true to preserve existing rendering.
  showCloseButton = true,
  container,
  className,
  commandProps,
  finalFocus,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, 'children'> &
  Pick<FixedPositionContentProps, 'showOverlay' | 'container'> &
  Pick<React.ComponentProps<typeof DialogContent>, 'finalFocus'> & {
    title?: string | undefined;
    description?: string | undefined;
    className?: string | undefined;
    showCloseButton?: boolean | undefined;
    children?: React.ReactNode | undefined;
    /** Passed to the inner `Command` (`filter`, `loop`, `shouldFilter`…). `className` merges with the dialog's. */
    commandProps?: Omit<React.ComponentProps<typeof Command>, 'children' | 'variant'> | undefined;
  }) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn('overflow-hidden', container === undefined ? container : 'absolute', className)}
        container={container}
        finalFocus={finalFocus}
        showCloseButton={showCloseButton}
        showOverlay={showOverlay}
      >
        <Command size="md" {...commandProps} variant="dialog">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

// The input is always controlled by the search, so `defaultValue` would be ignored.
type CommandInputProps = Omit<React.ComponentProps<'input'>, 'defaultValue' | 'type' | 'value'> &
  SharedProps & {
    /** Called with the search text on every change. */
    onValueChange?: ((search: string) => void) | undefined;
    /** Controlled search text. */
    value?: string | undefined;
  };

function CommandInput({ className, testId, value, onValueChange, onChange, ref, ...props }: CommandInputProps) {
  const { inputId, labelId, listId, store } = useCommandContext('CommandInput');
  // The list's actual id, which a caller may set on CommandList.
  const controls = useCommandStore(store, (state) => state.getListId()) ?? listId;
  const search = useCommandStore(store, (state) => state.getSearch());
  const selectedId = useCommandStore(store, (state) => state.getSelectedId());
  // An explicit accessible name on the input wins over the command's label.
  const labelledBy = props['aria-labelledby'] ?? (props['aria-label'] === undefined ? labelId : undefined);

  React.useLayoutEffect(() => {
    if (value !== undefined) {
      store.setSearch(value);
    }
  }, [store, value]);

  // The native combobox input of the primitive, as cmdk rendered it; the registry Input's frame would restyle it.
  const input = useRender({
    defaultTagName: 'input',
    ref: ref ?? null,
    props: {
      // A caller that renders the list only while open says so through these two.
      'aria-controls': controls,
      'aria-expanded': true,
      'data-testid': testId,
      id: inputId,
      ...props,
      ...cmdkAttributes.input,
      'aria-activedescendant': selectedId,
      'aria-autocomplete': 'list',
      'aria-labelledby': labelledBy,
      autoComplete: 'off',
      autoCorrect: 'off',
      className: cn(
        'flex h-10 w-full rounded-md bg-transparent py-3 text-body outline-hidden selection:bg-selection selection:text-selection-foreground placeholder:text-placeholder disabled:cursor-not-allowed disabled:opacity-50',
        className
      ),
      'data-slot': 'command-input',
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        onChange?.(event);
        if (value === undefined) {
          store.setSearch(event.currentTarget.value);
        }
        onValueChange?.(event.currentTarget.value);
      },
      role: 'combobox',
      spellCheck: false,
      type: 'text',
      value: value ?? search,
    } satisfies React.ComponentProps<'input'> & DataAttributes & CommandDomAttributes,
  });

  return (
    <div className="flex h-9 items-center gap-2 border-b !border-input px-3" data-slot="command-input-wrapper">
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      {input}
    </div>
  );
}

interface CommandListProps extends React.ComponentProps<'div'> {
  /** Accessible name for the listbox. Defaults to "Suggestions", as in cmdk. */
  label?: string | undefined;
}

function CommandList({ className, label = 'Suggestions', children, id, ref, ...props }: CommandListProps) {
  const { listId, store } = useCommandContext('CommandList');
  const selectedId = useCommandStore(store, (state) => state.getSelectedId());
  // A caller's id names the list, so pickers that wire their own `aria-controls` to it keep matching.
  const ownId = id ?? listId;

  React.useLayoutEffect(() => {
    store.setListId(ownId);
    return () => {
      store.setListId(undefined);
    };
  }, [store, ownId]);

  return useRender({
    defaultTagName: 'div',
    ref: [store.setListElement, ref ?? null],
    props: {
      'aria-label': label,
      'data-slot': 'command-list',
      ...props,
      'aria-activedescendant': selectedId,
      ...cmdkAttributes.list,
      className: cn('max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto', className),
      id: ownId,
      role: 'listbox',
      tabIndex: -1,
      // cmdk's sizer. As a flex column that grows with its content, it lets ranked items and groups reorder.
      children: (
        <div {...cmdkAttributes.listSizer} className="flex flex-col">
          {children}
        </div>
      ),
    } satisfies React.ComponentProps<'div'> & DataAttributes & CommandDomAttributes,
  });
}

function CommandEmpty({ className, testId, ref, ...props }: React.ComponentProps<'div'> & SharedProps) {
  const { store } = useCommandContext('CommandEmpty');
  const empty = useCommandStore(store, (state) => state.getVisibleCount() === 0);

  if (!empty) {
    return null;
  }
  return (
    <div
      data-slot="command-empty"
      data-testid={testId}
      {...props}
      {...cmdkAttributes.empty}
      className={cn('py-6 text-center text-body', className)}
      ref={ref}
      role="presentation"
    />
  );
}

interface CommandGroupProps extends React.ComponentProps<'div'>, SharedProps {
  /** Keeps the group and its items visible whatever the search. */
  forceMount?: boolean | undefined;
  heading?: React.ReactNode;
  value?: string | undefined;
}

function CommandGroup({
  className,
  heading,
  value,
  forceMount = false,
  testId,
  style,
  children,
  ref,
  ...props
}: CommandGroupProps) {
  const { shouldFilter, store } = useCommandContext('CommandGroup');
  const id = React.useId();
  const headingId = `${id}-heading`;
  const hasHeading = hasSlotContent(heading);
  const visible = useCommandStore(
    store,
    (state) => forceMount || !shouldFilter || state.getSearch() === '' || state.isGroupVisible(id)
  );
  const order = useCommandStore(store, (state) => state.getGroupOrder(id));
  const rankStyle: RankStyle = { ...style, '--cmdk-order': order };
  const groupRef = React.useRef<HTMLDivElement | null>(null);
  useRankedWrapper(groupRef, order, RANKED_GROUP_ROW_SELECTOR);
  // A listbox group, named by its heading. A <fieldset> would add form semantics inside the listbox.
  const items = useRender({
    defaultTagName: 'div',
    props: {
      ...cmdkAttributes.groupItems,
      'aria-labelledby': hasHeading ? headingId : undefined,
      className: 'flex flex-col',
      role: 'group',
      children: <CommandGroupContext.Provider value={{ forceMount, id }}>{children}</CommandGroupContext.Provider>,
    } satisfies React.ComponentProps<'div'> & CommandDomAttributes,
  });

  return useRender({
    defaultTagName: 'div',
    ref: [groupRef, ref ?? null],
    props: {
      'data-slot': 'command-group',
      'data-testid': testId,
      ...props,
      ...cmdkAttributes.group,
      className: cn(
        'order-(--cmdk-order) overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-body-sm [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-subtle',
        className
      ),
      'data-value': value,
      hidden: !visible,
      role: 'presentation',
      style: rankStyle,
      children: (
        <>
          {hasHeading ? (
            <div aria-hidden="true" {...cmdkAttributes.groupHeading} id={headingId}>
              {heading}
            </div>
          ) : null}
          {items}
        </>
      ),
    } satisfies React.ComponentProps<'div'> & DataAttributes & CommandDomAttributes,
  });
}

interface CommandSeparatorProps extends React.ComponentProps<'hr'> {
  /** Keeps the separator while searching. */
  alwaysRender?: boolean | undefined;
}

function CommandSeparator({ className, alwaysRender = false, ...props }: CommandSeparatorProps) {
  const { store } = useCommandContext('CommandSeparator');
  const visible = useCommandStore(store, (state) => alwaysRender || state.getSearch() === '');

  if (!visible) {
    return null;
  }
  return (
    <hr
      data-slot="command-separator"
      {...props}
      {...cmdkAttributes.separator}
      className={cn('-mx-1 h-px border-0 bg-border', className)}
    />
  );
}

const commandItemClassName =
  "relative order-(--cmdk-order) flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-body outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

interface CommandItemProps extends Omit<React.ComponentProps<'div'>, 'onSelect'>, SharedProps {
  disabled?: boolean | undefined;
  /** Renders the item whatever the search. Defaults to its group's `forceMount`. */
  forceMount?: boolean | undefined;
  /** Indents the item to line up with siblings that show a leading icon. */
  inset?: boolean | undefined;
  /** Extra terms the search matches, beside the value. */
  keywords?: readonly string[] | undefined;
  /** Called with the item's value on click or Enter. */
  onSelect?: ((value: string) => void) | undefined;
  /** Identifies the item for search and highlight. Defaults to its text content. */
  value?: string | undefined;
}

function CommandItem({
  className,
  value,
  keywords,
  disabled = false,
  forceMount,
  inset = false,
  onSelect,
  onClick,
  onPointerMove,
  testId,
  style,
  children,
  id,
  ref,
  ...props
}: CommandItemProps) {
  const { disablePointerSelection, filter, shouldFilter, store } = useCommandContext('CommandItem');
  const group = React.useContext(CommandGroupContext);
  const forced = forceMount ?? group?.forceMount ?? false;
  const generatedId = React.useId();
  const itemId = id ?? generatedId;
  const elementRef = React.useRef<HTMLDivElement | null>(null);
  // cmdk reads an item's value from its rendered text, so text from child components counts.
  const [renderedText, setRenderedText] = React.useState<string | undefined>(undefined);
  const itemValue = (value ?? renderedText ?? textFromNode(children)).trim();
  const search = useCommandStore(store, (state) => state.getSearch());
  const selected = useCommandStore(store, (state) => itemValue !== '' && state.getValue() === itemValue);
  const order = useCommandStore(store, (state) => state.getItemOrder(itemId));
  const filtering = shouldFilter && search !== '' && !forced;
  const score = filtering
    ? filter(
        itemValue,
        search,
        keywords?.map((keyword) => keyword.trim())
      )
    : 1;
  const visible = forced || score > 0;
  const rankStyle: RankStyle = { ...style, '--cmdk-order': order };

  const select = () => {
    if (disabled) {
      return;
    }
    store.setValue(itemValue);
    onSelect?.(itemValue);
  };

  React.useLayoutEffect(() => {
    store.setItem(itemId, { disabled, forceMount: forced, groupId: group?.id, score, value: itemValue, visible });
  }, [store, itemId, disabled, forced, group?.id, score, itemValue, visible]);

  React.useLayoutEffect(
    () => () => {
      store.removeItem(itemId);
    },
    [store, itemId]
  );

  useRankedWrapper(elementRef, order, RANKED_ITEM_ROW_SELECTOR);

  // Enter selects through the store, so it always runs the latest handler.
  React.useLayoutEffect(() => {
    store.setSelectHandler(itemId, select);
  });

  React.useLayoutEffect(() => {
    if (value !== undefined) {
      return;
    }
    const text = elementRef.current?.textContent.trim();
    if (text !== undefined && text !== itemValue) {
      setRenderedText(text);
    }
  });

  const item = useRender({
    defaultTagName: 'div',
    ref: [elementRef, ref ?? null],
    props: {
      'data-slot': 'command-item',
      'data-testid': testId,
      ...props,
      'aria-disabled': disabled,
      'aria-selected': selected,
      ...cmdkAttributes.item,
      className: cn(commandItemClassName, inset && 'pl-8', className),
      'data-disabled': disabled,
      'data-selected': selected,
      'data-value': itemValue,
      id: itemId,
      onClick: (event: React.MouseEvent<HTMLDivElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          select();
        }
      },
      onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
        onPointerMove?.(event);
        if (event.defaultPrevented || disabled || disablePointerSelection) {
          return;
        }
        store.setValue(itemValue);
      },
      role: 'option',
      style: rankStyle,
      children,
    } satisfies React.ComponentProps<'div'> & DataAttributes & CommandDomAttributes,
  });

  return visible ? item : null;
}

function CommandShortcut({ className, children, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn('ml-auto text-body-sm tracking-widest text-subtle', className)}
      data-slot="command-shortcut"
      {...props}
    >
      {children}
    </span>
  );
}

interface CommandSubContextType {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const CommandSubContext = React.createContext<CommandSubContextType | undefined>(undefined);

interface CommandSubProps {
  children: React.ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function CommandSub({ open, onOpenChange, children }: CommandSubProps) {
  return (
    <CommandSubContext.Provider value={{ open, onOpenChange }}>
      <Popover onOpenChange={onOpenChange} open={open}>
        {children}
      </Popover>
    </CommandSubContext.Provider>
  );
}

type CommandSubTriggerProps = CommandItemProps;

function CommandSubTrigger({ children, onSelect, testId, ...props }: CommandSubTriggerProps) {
  const ctx = React.useContext(CommandSubContext);

  return (
    // The anchor merges its own `data-testid` over the item's, so the test id travels through it.
    <PopoverAnchor
      render={
        <CommandItem
          data-slot="command-sub-trigger"
          onSelect={(selectedValue) => {
            onSelect?.(selectedValue);
            ctx?.onOpenChange(true);
          }}
          {...props}
        >
          {children}
          <ChevronRight className="ml-auto size-4" />
        </CommandItem>
      }
      testId={testId}
    />
  );
}

interface CommandSubContentProps {
  children: React.ReactNode;
  className?: string | undefined;
}

function CommandSubContent({ className, children }: CommandSubContentProps) {
  return (
    <PopoverContent align="start" className={cn('w-fit', className)} padding="none" side="right" sideOffset={4}>
      {children}
    </PopoverContent>
  );
}

interface SimpleCommandProps extends SharedProps {
  className?: string | undefined;
  emptyMessage?: string | undefined;
  groups: Array<{
    heading?: string | undefined;
    items: Array<{
      icon?: React.ReactNode | undefined;
      label: string;
      shortcut?: string | undefined;
      disabled?: boolean | undefined;
      onSelect?: (() => void) | undefined;
    }>;
  }>;
  placeholder?: string | undefined;
  size?: 'sm' | 'md' | 'lg' | 'full' | undefined;
}

function SimpleCommand({
  placeholder = 'Type a command or search...',
  emptyMessage = 'No results found.',
  groups,
  size = 'md',
  className,
  testId,
}: SimpleCommandProps) {
  return (
    <Command className={className} size={size} testId={testId}>
      <CommandInput placeholder={placeholder} />
      <CommandList>
        <CommandEmpty>{emptyMessage}</CommandEmpty>
        {groups.map((group, groupIndex) => (
          <React.Fragment
            key={group.heading === undefined || group.heading === '' ? `group-${groupIndex}` : group.heading}
          >
            {groupIndex > 0 && <CommandSeparator />}
            <CommandGroup heading={group.heading}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.label}
                  {...omitUndefined({ disabled: item.disabled })}
                  {...omitUndefined({ onSelect: item.onSelect })}
                >
                  {item.icon}
                  <span className="text-body">{item.label}</span>
                  {(item.shortcut ?? '') === '' ? null : <CommandShortcut>{item.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          </React.Fragment>
        ))}
      </CommandList>
    </Command>
  );
}

export type { CommandFilter } from './command/store';
export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  type CommandGroupProps,
  CommandInput,
  type CommandInputProps,
  CommandItem,
  type CommandItemProps,
  CommandList,
  type CommandListProps,
  type CommandProps,
  CommandSeparator,
  type CommandSeparatorProps,
  CommandShortcut,
  type CommandState,
  CommandSub,
  CommandSubContent,
  CommandSubTrigger,
  SimpleCommand,
  useCommandState,
};
