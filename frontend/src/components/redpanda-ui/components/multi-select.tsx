// Copyright 2026 Redpanda Data, Inc.

'use client';

import { commitAgentChange } from '../lib/commit-agent-change';
import * as Select from '@ui-sdk/react/select';
import { Check, ChevronDownIcon } from 'lucide-react';
import React from 'react';

import { TagsValue } from './tags';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { usePortalContainer } from '../lib/use-portal-container';
import { cn, type PortalContentProps, type PortalRootProps, type SharedProps } from '../lib/utils';

export interface MultiSelectOptionItem {
  label?: React.ReactNode;
  onDeselect?: (value: string, item: MultiSelectOptionItem) => void;
  onSelect?: (value: string, item: MultiSelectOptionItem) => void;
  selectedTestId?: string;
  testId?: string;
  value: string;
}
type RootProps = Extract<React.ComponentProps<typeof Select.Select<string, true>>, { multiple: true }>;
type MultiSelectProps = Omit<
  RootProps,
  'multiple' | 'value' | 'defaultValue' | 'onValueChange' | 'onSelect' | 'filter'
> &
  SharedProps & {
    value?: string[];
    defaultValue?: string[];
    onValueChange?: (value: string[], items: MultiSelectOptionItem[]) => void;
    onSelect?: (value: string, item: MultiSelectOptionItem) => void;
    onDeselect?: (value: string, item: MultiSelectOptionItem) => void;
    onSearch?: (query?: string) => void;
    maxCount?: number;
    filter?: boolean | ((keyword: string, current: string) => boolean);
  };
type MultiContext = {
  value: string[];
  itemCache: Map<string, MultiSelectOptionItem>;
  maxCount?: number;
  disabled?: boolean;
  register: (item: MultiSelectOptionItem) => void;
  remove: (value: string) => void;
};
const MultiSelectContext = React.createContext<MultiContext | null>(null);
function useMultiSelect() {
  const context = React.useContext(MultiSelectContext);
  if (!context) {
    throw new Error('Missing MultiSelect');
  }
  return context;
}
function MultiSelect({
  value: valueProp,
  defaultValue = [],
  onValueChange,
  onSelect,
  onDeselect,
  onSearch,
  onQueryChange,
  maxCount,
  disabled,
  filter,
  testId: _testId,
  ...props
}: MultiSelectProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const value = valueProp ?? uncontrolled;
  const [itemCache, setItemCache] = React.useState(new Map<string, MultiSelectOptionItem>());
  const controller = React.useMemo(() => Select.createSelectController<string, true>(), []);
  const register = React.useCallback((item: MultiSelectOptionItem) => {
    setItemCache((previous) => {
      if (previous.get(item.value) === item) {
        return previous;
      }
      const next = new Map(previous);
      next.set(item.value, item);
      return next;
    });
  }, []);
  return (
    <MultiSelectContext.Provider
      value={{
        value,
        itemCache,
        maxCount,
        disabled,
        register,
        remove: (removed) => {
          controller.setValue(value.filter((item) => item !== removed));
        },
      }}
    >
      <Select.Select<string, true>
        {...props}
        controller={controller}
        disabled={disabled}
        filter={
          onSearch || filter === false
            ? false
            : typeof filter === 'function'
              ? (item, query) => filter(query, item.value)
              : 'contains'
        }
        multiple
        modal={false}
        onQueryChange={(query, details) => {
          onQueryChange?.(query, details);
          if (!details.canceled) {
            onSearch?.(query);
          }
        }}
        onValueChange={(next, details) => {
          if (maxCount !== undefined && next.length > maxCount) {
            details.cancel();
            return;
          }
          const getItem = (item: string) => itemCache.get(item) ?? { value: item };
          for (const item of next) {
            if (!value.includes(item)) {
              const metadata = getItem(item);
              onSelect?.(item, metadata);
              metadata.onSelect?.(item, metadata);
            }
          }
          for (const item of value) {
            if (!next.includes(item)) {
              const metadata = getItem(item);
              onDeselect?.(item, metadata);
              metadata.onDeselect?.(item, metadata);
            }
          }
          commitAgentChange(
            () => {
              onValueChange?.(next, next.map(getItem));
              if (valueProp === undefined) setUncontrolled(next);
            },
            next,
            details
          );
        }}
        value={value}
      />
    </MultiSelectContext.Provider>
  );
}
type MultiSelectTriggerProps = React.ComponentProps<'div'> & SharedProps;
function MultiSelectTrigger({ children, className, testId, ref, ...props }: MultiSelectTriggerProps) {
  return (
    <Select.SelectTrigger
      data-testid={testId}
      render={
        <div
          {...props}
          className={cn(
            'flex min-h-9 w-fit cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-input-fill px-3 py-1.5 text-body shadow-xs outline-none hover:bg-input-fill-hover focus-visible:ring-2 focus-visible:ring-ring data-disabled:pointer-events-none data-disabled:opacity-50',
            className
          )}
          ref={ref}
        />
      }
    >
      {children}
      <ChevronDownIcon aria-hidden="true" className="size-4 opacity-50" />
    </Select.SelectTrigger>
  );
}
type MultiSelectValueProps = React.ComponentProps<'div'> &
  SharedProps & { maxDisplay?: number; maxItemLength?: number; placeholder?: string };
function MultiSelectValue({
  className,
  placeholder,
  maxDisplay,
  maxItemLength,
  testId,
  ...props
}: MultiSelectValueProps) {
  const { value, itemCache, remove } = useMultiSelect();
  if (!value.length) {
    return <Select.SelectValue className="pointer-events-none text-subtle" placeholder={placeholder} />;
  }
  const shown = maxDisplay ? value.slice(0, maxDisplay) : value;
  return (
    <TooltipProvider>
      <div className={cn('flex flex-1 flex-wrap items-center gap-1 overflow-hidden', className)} {...props}>
        {shown.map((itemValue) => {
          const item = itemCache.get(itemValue);
          const label = item?.label ?? itemValue;
          const truncated = typeof label === 'string' && maxItemLength !== undefined && label.length > maxItemLength;
          const tag = (
            <TagsValue
              onRemove={() => remove(itemValue)}
              testId={item?.selectedTestId ?? (testId ? `${testId}-selected-${itemValue}` : undefined)}
            >
              {truncated ? `${label.slice(0, maxItemLength)}…` : label}
            </TagsValue>
          );
          return truncated ? (
            <Tooltip key={itemValue}>
              <TooltipTrigger render={<span className="inline-flex">{tag}</span>} />
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ) : (
            <React.Fragment key={itemValue}>{tag}</React.Fragment>
          );
        })}
        {shown.length < value.length ? (
          <span className="text-body-sm text-subtle">+{value.length - shown.length}</span>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
type MultiSelectContentProps = React.ComponentProps<typeof Select.SelectContent> & SharedProps;
function MultiSelectContent({ className, container, testId, ...props }: MultiSelectContentProps) {
  const portalContainer = usePortalContainer();
  return (
    <Select.SelectContent
      align="start"
      className={cn(
        'z-50 max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
        className
      )}
      container={container ?? portalContainer}
      data-testid={testId}
      keepMounted
      sideOffset={4}
      {...props}
    />
  );
}
function MultiSelectSearch({ testId, ...props }: React.ComponentProps<typeof Select.SelectInput> & SharedProps) {
  return (
    <Select.SelectInput
      aria-label={props.placeholder ?? 'Search options'}
      className="h-9 w-full border-b border-input bg-transparent px-3 text-body outline-none"
      data-testid={testId}
      {...props}
    />
  );
}
const MultiSelectList = Select.SelectList;
const MultiSelectEmpty = Select.SelectEmpty;
const MultiSelectSeparator = Select.SelectSeparator;
function MultiSelectGroup({
  heading,
  testId,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Select.SelectGroup>, 'children'> &
  SharedProps & { heading?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Select.SelectGroup data-testid={testId} {...props}>
      {heading ? (
        <Select.SelectGroupLabel className="px-2 py-1.5 text-body-sm text-subtle">{heading}</Select.SelectGroupLabel>
      ) : null}
      {children}
    </Select.SelectGroup>
  );
}
type MultiSelectItemProps = Omit<
  React.ComponentProps<typeof Select.SelectItem<string>>,
  'value' | 'label' | 'children' | 'onSelect'
> &
  Partial<MultiSelectOptionItem> &
  SharedProps & { children?: React.ReactNode };
function MultiSelectItem({
  value = '',
  label,
  testId,
  selectedTestId,
  onSelect,
  onDeselect,
  children,
  className,
  disabled,
  ...props
}: MultiSelectItemProps) {
  const context = useMultiSelect();
  const metadata = React.useMemo(
    () => ({ value, label: label ?? children, testId, selectedTestId, onSelect, onDeselect }),
    [value, label, children, testId, selectedTestId, onSelect, onDeselect]
  );
  React.useLayoutEffect(() => context.register(metadata), [context.register, metadata]);
  const atLimit =
    context.maxCount !== undefined && context.value.length >= context.maxCount && !context.value.includes(value);
  return (
    <Select.SelectItem<string>
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-body outline-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground',
        className
      )}
      data-testid={testId}
      disabled={disabled || atLimit}
      label={typeof label === 'string' ? label : undefined}
      value={value}
      {...props}
    >
      <Select.SelectItemText>{() => children ?? label ?? value}</Select.SelectItemText>
      <Select.SelectItemIndicator className="ml-auto">
        <Check className="size-4" />
      </Select.SelectItemIndicator>
    </Select.SelectItem>
  );
}

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

function renderMultiSelectOptions(list: MultiSelectOption[]) {
  const occurrences = new Map<string, number>();
  return list.map((option) => {
    const identity = JSON.stringify(
      'type' in option ? ['separator', option.id] : ['children' in option ? 'group' : 'item', option.value]
    );
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    const key = `${identity}-${occurrence}`;
    if ('type' in option) {
      if (option.type === 'separator') {
        return <MultiSelectSeparator key={key} />;
      }

      return null;
    }

    if ('children' in option) {
      return (
        <MultiSelectGroup heading={option.heading} key={key} testId={option.testId}>
          {renderMultiSelectOptions(option.children)}
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

type SimpleMultiSelectProps = PortalRootProps &
  SharedProps &
  Pick<React.AriaAttributes, 'aria-describedby' | 'aria-invalid'> &
  Pick<PortalContentProps, 'container'> & {
    id?: string;
    options: MultiSelectOption[] | string[];
    value?: string[];
    onValueChange?: (value: string[]) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    maxCount?: number;
    maxDisplay?: number;
    searchable?: boolean;
    width?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'auto';
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
}: SimpleMultiSelectProps) {
  const normalizedOptions: MultiSelectOption[] = React.useMemo(
    () =>
      options.map((option) => {
        if (typeof option === 'string') {
          return { value: option, label: option };
        }
        return option;
      }),
    [options]
  );

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
      <MultiSelectTrigger
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        className={cn(widthClasses[width], className)}
        id={id}
        testId={testId ? `${testId}-control` : undefined}
      >
        <MultiSelectValue maxDisplay={maxDisplay} placeholder={placeholder} testId={testId} />
      </MultiSelectTrigger>
      <MultiSelectContent container={container} testId={testId ? `${testId}-content` : undefined}>
        {searchable ? (
          <MultiSelectSearch placeholder="Search..." testId={testId ? `${testId}-search` : undefined} />
        ) : null}
        <MultiSelectList>{renderMultiSelectOptions(normalizedOptions)}</MultiSelectList>
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
  MultiSelectSearch,
  MultiSelectSeparator,
  MultiSelectTrigger,
  MultiSelectValue,
  renderMultiSelectOptions,
  SimpleMultiSelect,
};
