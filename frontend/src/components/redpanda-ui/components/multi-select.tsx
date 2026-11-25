'use client';

// Copyright 2026 Redpanda Data, Inc.

import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { useRender } from '@base-ui/react/use-render';
import { Check, ChevronDownIcon } from 'lucide-react';
import React from 'react';
import { createPortal } from 'react-dom';
import { Button } from './button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from './command';
import { TooltipProvider } from './tooltip';
import { useControllableState } from '../lib/use-controllable-state';
import { hasSlotContent } from '../lib/has-slot-content';
import { cn, type PortalContentProps, type PortalRootProps, type SharedProps } from '../lib/utils';
import { omitUndefined } from '../lib/utils/omit-undefined';

import { MultiSelectContext, type MultiSelectOptionItem, useMultiSelect } from './multi-select/context';
import { getPopoverInteractionTarget } from './multi-select/popover-interaction';
import { SelectedChip } from './multi-select/selected-chip';
import { useSelectedValueRemoval } from './multi-select/use-selected-value-removal';

export type { MultiSelectOptionItem } from './multi-select/context';

/** A node's own text, for search keywords. Anything richer than a string has none to offer. */
const asText = (node: React.ReactNode): string | undefined => (typeof node === 'string' ? node : undefined);

type MultiSelectProps = Omit<React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Root>, 'onOpenChange'> &
  SharedProps & {
    value?: string[] | undefined;
    onValueChange?: ((value: string[], items: MultiSelectOptionItem[]) => void) | undefined;
    onSelect?: ((value: string, item: MultiSelectOptionItem) => void) | undefined;
    onDeselect?: ((value: string, item: MultiSelectOptionItem) => void) | undefined;
    defaultValue?: string[] | undefined;
    onOpenChange?: ((open: boolean, eventDetails: PopoverPrimitive.Root.ChangeEventDetails) => void) | undefined;
    onSearch?: (keyword: string | undefined) => void;
    filter?: boolean | ((keyword: string, current: string) => boolean) | undefined;
    disabled?: boolean | undefined;
    maxCount?: number | undefined;
  };

const MultiSelect: React.FC<MultiSelectProps> = ({
  value: valueProp,
  onValueChange: onValueChangeProp,
  onDeselect: onDeselectProp,
  onSelect: onSelectProp,
  defaultValue,
  open: openProp,
  onOpenChange,
  defaultOpen,
  onSearch,
  filter,
  disabled,
  maxCount,
  ...popoverProps
}) => {
  const controlRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [itemCache, cacheItem] = React.useReducer(
    (current: Map<string, MultiSelectOptionItem>, item: MultiSelectOptionItem) => {
      const previous = current.get(item.value);
      if (
        previous?.label === item.label &&
        previous?.selectedTestId === item.selectedTestId &&
        previous?.testId === item.testId &&
        previous?.value === item.value
      ) {
        return current;
      }
      return new Map(current).set(item.value, item);
    },
    undefined,
    () => new Map<string, MultiSelectOptionItem>()
  );

  const handleValueChange = (state: string[]) => {
    if (onValueChangeProp !== undefined) {
      const items = state.map((itemValue) => {
        const cachedItem = itemCache.get(itemValue);
        if (cachedItem === undefined) {
          throw new Error('MultiSelect selected an item that is missing from the item cache.');
        }
        return cachedItem;
      });

      onValueChangeProp(state, items);
    }
  };

  const [value, setValue] = useControllableState({
    prop: valueProp,
    defaultProp: defaultValue ?? [],
    onChange: handleValueChange,
  });

  const [open, setOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen ?? false,
  });

  const handleOpenChange = (nextOpen: boolean, eventDetails: PopoverPrimitive.Root.ChangeEventDetails) => {
    const target = getPopoverInteractionTarget(eventDetails);
    const withinControl = target instanceof Node && controlRef.current?.contains(target) === true;
    if (
      (nextOpen && disabled === true) ||
      (withinControl && (eventDetails.reason === 'outside-press' || eventDetails.reason === 'focus-out'))
    ) {
      eventDetails.cancel();
      return;
    }
    onOpenChange?.(nextOpen, eventDetails);
    if (!eventDetails.isCanceled) {
      setOpen(nextOpen);
      if (!nextOpen && withinControl && eventDetails.reason === 'escape-key') {
        triggerRef.current?.focus({ preventScroll: true });
      }
    }
  };

  const handleSelect = (selectedValue: string, item: MultiSelectOptionItem) => {
    setValue((prev: string[]) => {
      if (prev.includes(selectedValue)) {
        return prev;
      }

      onSelectProp?.(selectedValue, item);

      return [...prev, selectedValue];
    });
  };

  const handleDeselect = (deselectedValue: string, item: MultiSelectOptionItem) => {
    setValue((prev: string[]) => {
      if (!prev.includes(deselectedValue)) {
        return prev;
      }

      onDeselectProp?.(deselectedValue, item);

      return prev.filter((v: string) => v !== deselectedValue);
    });
  };

  const contextValue = {
    value,
    open,
    onSearch,
    filter,
    disabled,
    maxCount,
    onSelect: handleSelect,
    onDeselect: handleDeselect,
    itemCache,
    cacheItem,
    controlRef,
    triggerRef,
  };

  return (
    <MultiSelectContext.Provider value={contextValue}>
      <PopoverPrimitive.Root {...popoverProps} onOpenChange={handleOpenChange} open={open} />
    </MultiSelectContext.Provider>
  );
};

MultiSelect.displayName = 'MultiSelect';

export interface MultiSelectControlProps extends React.ComponentPropsWithoutRef<'div'>, SharedProps {}

/** A noninteractive field shell. Keep the selected values and native opener as siblings. */
export function MultiSelectControl({ className, testId, ...props }: MultiSelectControlProps) {
  const { controlRef, disabled } = useMultiSelect();
  return (
    <div
      {...props}
      className={cn(
        'flex min-h-9 w-fit items-center gap-1 rounded-md border !border-input bg-input-fill p-0.5 shadow-xs transition-[color,background-color,border-color,box-shadow] focus-within:!border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[button[aria-invalid=true]]:!border-destructive has-[button[aria-invalid=true]]:ring-invalid data-disabled:cursor-not-allowed data-disabled:opacity-50 motion-reduce:transition-none',
        className
      )}
      data-disabled={disabled === true || undefined}
      data-slot="multi-select-control"
      data-testid={testId}
      ref={controlRef}
    />
  );
}

export interface MultiSelectTriggerProps
  extends Omit<React.ComponentPropsWithRef<'button'>, 'children' | 'type'>,
    SharedProps {
  /** Visible opener text when no values are selected. Name the control with aria-label or an associated label. */
  placeholder?: string | undefined;
}

/** Native opener only: selected chips belong beside it in MultiSelectControl, never inside it. */
export function MultiSelectTrigger({
  placeholder = 'Select items...',
  disabled: disabledProp,
  className,
  testId,
  ref,
  'aria-label': ariaLabel,
  ...props
}: MultiSelectTriggerProps) {
  const { disabled, value, triggerRef } = useMultiSelect();
  return (
    <PopoverPrimitive.Trigger
      {...props}
      aria-label={
        ariaLabel ??
        (props.id === undefined && props['aria-labelledby'] === undefined ? 'Multi-select trigger' : undefined)
      }
      className={cn('min-w-8', value.length === 0 ? 'flex-1' : 'shrink-0', className)}
      disabled={disabled === true || disabledProp === true}
      ref={triggerRef}
      render={<Button ref={ref} size="sm" testId={testId} variant="ghost" weight="normal" />}
      type="button"
    >
      <span className="flex w-full items-center justify-between gap-2 text-body-lg md:text-body">
        {value.length === 0 ? <span className="text-subtle">{placeholder}</span> : null}
        <ChevronDownIcon aria-hidden="true" />
      </span>
    </PopoverPrimitive.Trigger>
  );
}

export interface MultiSelectValueProps extends React.ComponentPropsWithRef<'div'>, SharedProps {
  maxDisplay?: number | undefined;
  maxItemLength?: number | undefined;
}

export function MultiSelectValue({
  className,
  maxDisplay,
  maxItemLength,
  testId,
  ref,
  ...props
}: MultiSelectValueProps) {
  const { value, itemCache, disabled } = useMultiSelect();
  const { containerRef, error, remove } = useSelectedValueRemoval();
  if (value.length === 0 && error === undefined) {
    return null;
  }
  const renderItems = maxDisplay !== undefined && maxDisplay > 0 ? value.slice(0, maxDisplay) : value;
  const renderRemain = value.length - renderItems.length;
  return (
    <TooltipProvider>
      <div
        {...props}
        className={cn('flex min-w-0 flex-1 flex-wrap items-center gap-1 empty:hidden', className)}
        data-slot="multi-select-value"
        data-testid={testId}
        ref={ref}
      >
        <div className="contents" ref={containerRef}>
          {renderItems.map((itemValue) => {
            const item = itemCache.get(itemValue);
            const content = item?.label ?? itemValue;
            const label = typeof content === 'string' ? content : itemValue;
            const truncated = maxItemLength !== undefined && maxItemLength > 0 && label.length > maxItemLength;
            const display = truncated ? `${label.slice(0, maxItemLength)}...` : content;
            return (
              <SelectedChip
                content={display}
                disabled={disabled === true || item === undefined}
                itemValue={itemValue}
                key={itemValue}
                label={label}
                onRemove={(event) => {
                  if (item !== undefined) {
                    remove(event, itemValue, item);
                  }
                }}
                testId={
                  item?.selectedTestId ??
                  (testId === undefined || testId === '' ? undefined : `${testId}-selected-${itemValue}`)
                }
                truncated={truncated}
              />
            );
          })}
        </div>
        {renderRemain > 0 ? <span className="py-0.5 text-body-sm text-subtle">+{renderRemain}</span> : null}
        {error === undefined ? null : <p role="alert">{error}</p>}
      </div>
    </TooltipProvider>
  );
}

const MultiSelectSearch = ({
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof CommandInput> & {
  ref?: React.Ref<React.ComponentRef<typeof CommandInput>> | undefined;
}) => {
  const { onSearch, disabled } = useMultiSelect();

  return (
    <CommandInput
      ref={ref}
      {...props}
      disabled={disabled === true || props.disabled === true}
      {...omitUndefined({ onValueChange: onSearch })}
    />
  );
};

MultiSelectSearch.displayName = 'MultiSelectSearch';

const MultiSelectList = ({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof CommandList> & {
  ref?: React.Ref<React.ComponentRef<typeof CommandList>> | undefined;
}) => <CommandList className={cn('max-h-none', className)} ref={ref} {...props} />;

MultiSelectList.displayName = 'MultiSelectList';

interface MultiSelectContentProps extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Popup>, SharedProps {
  container?: React.ComponentProps<typeof PopoverPrimitive.Portal>['container'];
}

const MultiSelectContent = ({
  className,
  children,
  container,
  testId,
  ref,
  ...props
}: MultiSelectContentProps & { ref?: React.Ref<HTMLDivElement> | undefined }) => {
  const context = useMultiSelect();

  const [fragment] = React.useReducer(
    (current: DocumentFragment | null) => current,
    undefined,
    () => (typeof document === 'undefined' ? null : document.createDocumentFragment())
  );
  const popupRef = React.useRef<HTMLDivElement | null>(null);

  // Focus with `preventScroll`; Base UI's default focus scrolls the page when the popup flips above the trigger.
  const initialFocus = (openType: string) => {
    const popup = popupRef.current;
    if (popup === null) {
      return false;
    }
    if (openType === 'touch') {
      return popup;
    }
    const input = popup.querySelector<HTMLElement>('[cmdk-input]');
    if (input !== null) {
      input.focus({ preventScroll: true });
      return false;
    }
    return popup;
  };

  const popup = useRender({
    ref: [popupRef, ref ?? null],
    render: (
      <PopoverPrimitive.Popup
        className={cn(
          'data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[closed]:animate-out data-[open]:animate-in relative max-h-(--available-height) min-w-[8rem] origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
          className
        )}
        data-testid={testId}
        initialFocus={initialFocus}
        {...props}
      >
        <Command
          className={cn('max-h-96 w-full min-w-(--anchor-width)', className)}
          shouldFilter={context.onSearch === undefined}
        >
          {children}
        </Command>
      </PopoverPrimitive.Popup>
    ),
  });

  if (!context.open) {
    return fragment === null ? null : createPortal(<Command>{children}</Command>, fragment);
  }

  return (
    <PopoverPrimitive.Portal container={container} keepMounted>
      <PopoverPrimitive.Positioner
        align="start"
        anchor={context.controlRef}
        className="z-50"
        collisionPadding={10}
        positionMethod="fixed"
        sideOffset={4}
      >
        {popup}
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
};

MultiSelectContent.displayName = 'MultiSelectContent';

type MultiSelectItemProps = React.ComponentPropsWithoutRef<typeof CommandItem> &
  Partial<MultiSelectOptionItem> &
  SharedProps & {
    onSelect?: ((value: string, item: MultiSelectOptionItem) => void) | undefined;
    onDeselect?: ((value: string, item: MultiSelectOptionItem) => void) | undefined;
  };

function resolveMultiSelectItem({
  value,
  label,
  children,
  selectedTestId,
  testId,
}: {
  value: string | undefined;
  label: React.ReactNode;
  children: React.ReactNode;
  selectedTestId: string | undefined;
  testId: string | undefined;
}): MultiSelectOptionItem | undefined {
  if (value === undefined || value === '') {
    return;
  }
  return {
    value,
    label: [label, typeof children === 'string' ? children : undefined].find(hasSlotContent),
    selectedTestId,
    testId,
  };
}

function hasReachedSelectionLimit(count: number, maximum: number | undefined): boolean {
  return maximum !== undefined && maximum !== 0 && !Number.isNaN(maximum) && count >= maximum;
}

const MultiSelectItem = ({
  value,
  onSelect: onSelectProp,
  onDeselect: onDeselectProp,
  children,
  label,
  disabled: disabledProp,
  className,
  selectedTestId,
  testId,
  ref: forwardedRef,
  ...props
}: MultiSelectItemProps & { ref?: React.Ref<React.ComponentRef<typeof CommandItem>> | undefined }) => {
  const { value: contextValue, maxCount, onSelect, onDeselect, cacheItem, disabled: rootDisabled } = useMultiSelect();

  const item = resolveMultiSelectItem({ value, label, children, selectedTestId, testId });
  const selected = item !== undefined && contextValue.includes(item.value);

  React.useEffect(
    function registerOption() {
      const registeredItem = resolveMultiSelectItem({ value, label, children, selectedTestId, testId });
      if (registeredItem !== undefined) {
        cacheItem(registeredItem);
      }
    },
    [value, label, children, selectedTestId, testId, cacheItem]
  );

  const disabled =
    rootDisabled === true ||
    disabledProp === true ||
    (!selected && hasReachedSelectionLimit(contextValue.length, maxCount));

  const handleClick = () => {
    if (item === undefined) {
      return;
    }
    if (selected) {
      onDeselectProp?.(item.value, item);
      onDeselect(item.value, item);
    } else {
      onSelectProp?.(item.value, item);
      onSelect(item.value, item);
    }
  };

  const labelText = asText(label) ?? asText(children);
  const keywords = labelText !== undefined && labelText !== '' && labelText !== value ? [labelText] : undefined;

  return (
    <CommandItem
      {...props}
      className={cn(disabled && 'cursor-not-allowed', className)}
      {...omitUndefined({ disabled })}
      {...omitUndefined({ keywords })}
      {...omitUndefined({ onSelect: !disabled && item !== undefined ? handleClick : undefined })}
      ref={forwardedRef}
      testId={testId}
      {...omitUndefined({ value })}
    >
      <span className="mr-2 truncate">{[children, label, value].find(hasSlotContent)}</span>
      {selected ? <Check className="ml-auto size-4 shrink-0" /> : null}
    </CommandItem>
  );
};

MultiSelectItem.displayName = 'MultiSelectItem';

const MultiSelectGroup = ({
  testId,
  ref: forwardRef,
  ...props
}: React.ComponentPropsWithoutRef<typeof CommandGroup> &
  SharedProps & { ref?: React.Ref<React.ComponentRef<typeof CommandGroup>> | undefined }) => (
  <CommandGroup {...props} ref={forwardRef} testId={testId} />
);

MultiSelectGroup.displayName = 'MultiSelectGroup';

const MultiSelectSeparator = ({
  ref: forwardRef,
  ...props
}: React.ComponentPropsWithoutRef<typeof CommandSeparator> & {
  ref?: React.Ref<React.ComponentRef<typeof CommandSeparator>> | undefined;
}) => <CommandSeparator {...props} ref={forwardRef} />;

MultiSelectSeparator.displayName = 'MultiSelectSeparator';

const MultiSelectEmpty = ({
  children = 'No Content',
  ref: forwardRef,
  ...props
}: React.ComponentPropsWithoutRef<typeof CommandEmpty> & {
  ref?: React.Ref<React.ComponentRef<typeof CommandEmpty>> | undefined;
}) => (
  <CommandEmpty {...props} ref={forwardRef}>
    {children}
  </CommandEmpty>
);

MultiSelectEmpty.displayName = 'MultiSelectEmpty';

export interface MultiSelectOptionSeparator {
  id?: string;
  type: 'separator';
}

export interface MultiSelectOptionGroup {
  children: MultiSelectOption[];
  heading?: React.ReactNode;
  testId?: string;
  value?: string;
}

export type MultiSelectOption =
  | Pick<MultiSelectItemProps, 'value' | 'label' | 'disabled' | 'onSelect' | 'onDeselect' | 'selectedTestId' | 'testId'>
  | MultiSelectOptionSeparator
  | MultiSelectOptionGroup;

function MultiSelectOptions({ options }: { options: MultiSelectOption[] }) {
  const occurrences = new Map<string, number>();
  return options.map((option) => {
    const identity = JSON.stringify(
      'type' in option ? ['separator', option.id] : ['children' in option ? 'group' : 'item', option.value]
    );
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    const key = `${identity}-${occurrence}`;
    if ('type' in option) {
      return <MultiSelectSeparator key={key} />;
    }

    if ('children' in option) {
      return (
        <MultiSelectGroup
          heading={option.heading}
          key={key}
          testId={option.testId}
          {...omitUndefined({ value: option.value })}
        >
          <MultiSelectOptions options={option.children} />
        </MultiSelectGroup>
      );
    }

    return (
      <MultiSelectItem key={key} {...option} testId={option.testId}>
        {option.label}
      </MultiSelectItem>
    );
  });
}

type SimpleMultiSelectProps = Omit<PortalRootProps, 'onOpenChange'> &
  Pick<MultiSelectProps, 'onOpenChange'> &
  SharedProps &
  Pick<React.AriaAttributes, 'aria-describedby' | 'aria-invalid' | 'aria-label' | 'aria-labelledby'> &
  Pick<PortalContentProps, 'container'> & {
    id?: string | undefined;
    options: MultiSelectOption[] | string[];
    value?: string[] | undefined;
    onValueChange?: ((value: string[]) => void) | undefined;
    placeholder?: string | undefined;
    className?: string | undefined;
    disabled?: boolean | undefined;
    maxCount?: number | undefined;
    maxDisplay?: number | undefined;
    searchable?: boolean | undefined;
    width?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'auto' | undefined;
  };

const widthClasses = {
  sm: 'w-48',
  md: 'w-64',
  lg: 'w-80',
  xl: 'w-96',
  full: 'w-full',
  auto: 'w-auto',
};

function SimpleMultiSelect({
  id,
  options,
  value,
  onValueChange,
  placeholder = 'Select items...',
  className,
  disabled,
  maxCount,
  maxDisplay,
  searchable = true,
  width = 'md',
  container,
  open,
  defaultOpen,
  onOpenChange,
  testId,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: SimpleMultiSelectProps) {
  const normalizedOptions: MultiSelectOption[] = options.map((option) => {
    if (typeof option === 'string') {
      return { value: option, label: option };
    }
    return option;
  });

  return (
    <MultiSelect
      defaultOpen={defaultOpen}
      disabled={disabled}
      maxCount={maxCount}
      onOpenChange={onOpenChange}
      onValueChange={onValueChange}
      open={open}
      testId={testId}
      value={value}
    >
      <MultiSelectControl className={cn(widthClasses[width], className)}>
        <MultiSelectValue maxDisplay={maxDisplay} testId={testId} />
        <MultiSelectTrigger
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          id={id}
          placeholder={placeholder}
          testId={testId !== undefined && testId !== '' ? `${testId}-control` : undefined}
        />
      </MultiSelectControl>
      <MultiSelectContent
        container={container}
        testId={testId !== undefined && testId !== '' ? `${testId}-content` : undefined}
      >
        {searchable ? (
          <MultiSelectSearch
            placeholder="Search..."
            testId={testId !== undefined && testId !== '' ? `${testId}-search` : undefined}
          />
        ) : null}
        <MultiSelectList>
          <MultiSelectOptions options={normalizedOptions} />
        </MultiSelectList>
        <MultiSelectEmpty>No items found</MultiSelectEmpty>
      </MultiSelectContent>
    </MultiSelect>
  );
}

export {
  MultiSelect,
  MultiSelectContent,
  MultiSelectEmpty,
  MultiSelectGroup,
  MultiSelectItem,
  MultiSelectList,
  MultiSelectOptions,
  MultiSelectSearch,
  MultiSelectSeparator,
  SimpleMultiSelect,
};
