/** biome-ignore-all lint/a11y/useKeyWithClickEvents: part of multi select implementation */
/** biome-ignore-all lint/a11y/noStaticElementInteractions: part of multi select implementation */
'use client';

import { Check, ChevronDownIcon } from 'lucide-react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import React from 'react';
import { createPortal } from 'react-dom';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from './command';
import { TagsValue } from './tags';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { useControllableState } from '../lib/use-controllable-state';
import { cn } from '../lib/utils';

export interface MultiSelectOptionItem {
  value: string;
  label?: React.ReactNode;
}

interface MultiSelectContextValue {
  value: string[];

  open: boolean;

  onSelect: (value: string, item: MultiSelectOptionItem) => void;

  onDeselect: (value: string, item: MultiSelectOptionItem) => void;

  onSearch?: (keyword?: string) => void;

  filter?: boolean | ((keyword: string, current: string) => boolean);

  disabled?: boolean;

  maxCount?: number;

  itemCache: Map<string, MultiSelectOptionItem>;
}

const MultiSelectContext = React.createContext<MultiSelectContextValue | undefined>(undefined);

function useMultiSelect() {
  const context = React.useContext(MultiSelectContext);

  if (!context) throw new Error('useMultiSelect must be used within MultiSelectProvider');

  return context;
}

type MultiSelectProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Root> & {
  value?: string[];
  onValueChange?: (value: string[], items: MultiSelectOptionItem[]) => void;
  onSelect?: (value: string, item: MultiSelectOptionItem) => void;
  onDeselect?: (value: string, item: MultiSelectOptionItem) => void;
  defaultValue?: string[];
  onSearch?: (keyword: string | undefined) => void;
  filter?: boolean | ((keyword: string, current: string) => boolean);
  disabled?: boolean;
  maxCount?: number;
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
  const itemCache = React.useRef(new Map<string, MultiSelectOptionItem>()).current;

  const handleValueChange = React.useCallback(
    (state: string[]) => {
      if (onValueChangeProp) {
        // biome-ignore lint/style/noNonNullAssertion: part of multi-select implementation
        const items = state.map((v) => itemCache.get(v)!);

        onValueChangeProp(state, items);
      }
    },
    [onValueChangeProp, itemCache],
  );

  const [value, setValue] = useControllableState({
    prop: valueProp,
    defaultProp: defaultValue ?? [],
    onChange: handleValueChange,
  });

  const [open, setOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen ?? false,
    onChange: onOpenChange,
  });

  const handleSelect = React.useCallback(
    (value: string, item: MultiSelectOptionItem) => {
      setValue((prev) => {
        if (prev?.includes(value)) return prev;

        onSelectProp?.(value, item);

        return prev ? [...prev, value] : [value];
      });
    },
    [onSelectProp, setValue],
  );

  const handleDeselect = React.useCallback(
    (value: string, item: MultiSelectOptionItem) => {
      setValue((prev) => {
        if (!prev || !prev.includes(value)) return prev;

        onDeselectProp?.(value, item);

        return prev.filter((v) => v !== value);
      });
    },
    [onDeselectProp, setValue],
  );

  const contextValue = React.useMemo(() => {
    return {
      value: value || [],
      open: open || false,
      onSearch,
      filter,
      disabled,
      maxCount,
      onSelect: handleSelect,
      onDeselect: handleDeselect,
      itemCache,
    };
  }, [value, open, onSearch, filter, disabled, maxCount, handleSelect, handleDeselect, itemCache]);

  return (
    <MultiSelectContext.Provider value={contextValue}>
      <PopoverPrimitive.Root {...popoverProps} open={open} onOpenChange={setOpen} />
    </MultiSelectContext.Provider>
  );
};

MultiSelect.displayName = 'MultiSelect';

interface MultiSelectTriggerProps extends React.ComponentPropsWithoutRef<'div'> {}

function PreventClick(e: React.MouseEvent | React.TouchEvent) {
  e.preventDefault();
  e.stopPropagation();
}

const MultiSelectTrigger = React.forwardRef<React.ComponentRef<'button'>, MultiSelectTriggerProps>(
  ({ className, children, ...props }, forwardedRef) => {
    const { disabled } = useMultiSelect();

    return (
      <PopoverPrimitive.Trigger ref={forwardedRef} asChild>
        <div
          aria-disabled={disabled}
          data-disabled={disabled}
          {...props}
          className={cn(
            "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-1 h-9 text-base md:text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-text',
            className,
          )}
          onClick={disabled ? PreventClick : props.onClick}
          onTouchStart={disabled ? PreventClick : props.onTouchStart}
        >
          {children}
          <ChevronDownIcon aria-hidden className="size-4 opacity-50" />
        </div>
      </PopoverPrimitive.Trigger>
    );
  },
);

MultiSelectTrigger.displayName = 'MultiSelectTrigger';

interface MultiSelectValueProps extends React.ComponentPropsWithoutRef<'div'> {
  placeholder?: string;
  maxDisplay?: number;
  maxItemLength?: number;
}

const MultiSelectValue = React.forwardRef<React.ComponentRef<'div'>, MultiSelectValueProps>(
  ({ className, placeholder, maxDisplay, maxItemLength, ...props }, forwardRef) => {
    const { value, itemCache, onDeselect } = useMultiSelect();

    const renderRemain = maxDisplay && value.length > maxDisplay ? value.length - maxDisplay : 0;
    const renderItems = renderRemain ? value.slice(0, maxDisplay) : value;

    if (!value.length) {
      return <span className="text-muted-foreground pointer-events-none">{placeholder}</span>;
    }

    return (
      <TooltipProvider delayDuration={300}>
        <div
          className={cn('flex flex-1 flex-nowrap items-center gap-0.25 overflow-x-scroll', className)}
          {...props}
          ref={forwardRef}
        >
          {renderItems.map((value) => {
            const item = itemCache.get(value);

            const content = item?.label || value;

            // For React nodes, don't truncate - show full content
            const child =
              maxItemLength && typeof content === 'string' && content.length > maxItemLength
                ? `${content.slice(0, maxItemLength)}...`
                : content;
            
            // Determine if we should show a tooltip - only for truncated strings
            const shouldShowTooltip = maxItemLength && typeof content === 'string' && content.length > maxItemLength;

            const el = (
              <TagsValue
                key={value}
                onRemove={() => {
                  if (!item) return;

                  onDeselect(value, item);
                }}
              >
                {child}
              </TagsValue>
            );

            if (shouldShowTooltip) {
              return (
                <Tooltip key={value}>
                  <TooltipTrigger className="inline-flex">{el}</TooltipTrigger>
                  <TooltipContent side="bottom" align="start" className="z-[51]">
                    {content}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return el;
          })}
          {renderRemain ? <span className="text-muted-foreground py-.5 text-xs leading-4">+{renderRemain}</span> : null}
        </div>
      </TooltipProvider>
    );
  },
);

MultiSelectValue.displayName = 'MultiSelectValue';

const MultiSelectSearch = React.forwardRef<
  React.ComponentRef<typeof CommandInput>,
  React.ComponentPropsWithoutRef<typeof CommandInput>
>((props, ref) => {
  const { onSearch } = useMultiSelect();

  return <CommandInput ref={ref} {...props} onValueChange={onSearch} />;
});

MultiSelectSearch.displayName = 'MultiSelectSearch';

const MultiSelectList = React.forwardRef<
  React.ComponentRef<typeof CommandList>,
  React.ComponentPropsWithoutRef<typeof CommandList>
>(({ className, ...props }, ref) => {
  return <CommandList ref={ref} className={cn('max-h-[unset] px-0 py-1', className)} {...props} />;
});

MultiSelectList.displayName = 'MultiSelectList';

interface MultiSelectContentProps extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  container?: Element;
}

const MultiSelectContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  MultiSelectContentProps
>(({ className, children, container, ...props }, ref) => {
  const context = useMultiSelect();

  const fragmentRef = React.useRef<DocumentFragment | null>(null);

  if (!fragmentRef.current && typeof window !== 'undefined') fragmentRef.current = document.createDocumentFragment();

  if (!context.open) {
    return fragmentRef.current ? createPortal(<Command>{children}</Command>, fragmentRef.current) : null;
  }

  return (
    <PopoverPrimitive.Portal forceMount container={container}>
      <PopoverPrimitive.Content
        ref={ref}
        align="start"
        sideOffset={4}
        collisionPadding={10}
        className={cn(
          'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border shadow-md data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
          className,
        )}
        style={
          {
            '--radix-select-content-transform-origin': 'var(--radix-popper-transform-origin)',
            '--radix-select-content-available-width': 'var(--radix-popper-available-width)',
            '--radix-select-content-available-height': 'var(--radix-popper-available-height)',
            '--radix-select-trigger-width': 'var(--radix-popper-anchor-width)',
            '--radix-select-trigger-height': 'var(--radix-popper-anchor-height)',
          } as React.CSSProperties
        }
        {...props}
      >
        <Command
          className={cn('max-h-96 w-full min-w-[var(--radix-select-trigger-width)] px-1', className)}
          shouldFilter={!context.onSearch}
        >
          {children}
        </Command>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
});

MultiSelectContent.displayName = 'MultiSelectContent';

type MultiSelectItemProps = React.ComponentPropsWithoutRef<typeof CommandItem> &
  Partial<MultiSelectOptionItem> & {
    onSelect?: (value: string, item: MultiSelectOptionItem) => void;
    onDeselect?: (value: string, item: MultiSelectOptionItem) => void;
  };

const MultiSelectItem = React.forwardRef<React.ComponentRef<typeof CommandItem>, MultiSelectItemProps>(
  (
    {
      value,
      onSelect: onSelectProp,
      onDeselect: onDeselectProp,
      children,
      label,
      disabled: disabledProp,
      className,
      ...props
    },
    forwardedRef,
  ) => {
    const { value: contextValue, maxCount, onSelect, onDeselect, itemCache } = useMultiSelect();

    const item = React.useMemo(() => {
      return value
        ? {
            value,
            label: label || (typeof children === 'string' ? children : undefined),
          }
        : undefined;
    }, [value, label, children]);

    const selected = Boolean(value && contextValue.includes(value));

    // biome-ignore lint/correctness/useExhaustiveDependencies: part of multi-select implementation
    React.useEffect(() => {
      // biome-ignore lint/style/noNonNullAssertion: part of multi-select implementation
      if (value) itemCache.set(value, item!);
    }, [selected, value, item, itemCache]);

    const disabled = Boolean(disabledProp || (!selected && maxCount && contextValue.length >= maxCount));

    const handleClick = () => {
      if (selected) {
        // biome-ignore lint/style/noNonNullAssertion: part of multi-select implementation
        onDeselectProp?.(value!, item!);
        // biome-ignore lint/style/noNonNullAssertion: part of multi-select implementation
        onDeselect(value!, item!);
      } else {
        // biome-ignore lint/style/noNonNullAssertion: part of multi-select implementation
        itemCache.set(value!, item!);
        // biome-ignore lint/style/noNonNullAssertion: part of multi-select implementation
        onSelectProp?.(value!, item!);
        // biome-ignore lint/style/noNonNullAssertion: part of multi-select implementation
        onSelect(value!, item!);
      }
    };

    return (
      <CommandItem
        {...props}
        value={value}
        className={cn(disabled && 'text-muted-foreground cursor-not-allowed', className)}
        disabled={disabled}
        onSelect={!disabled && value ? handleClick : undefined}
        ref={forwardedRef}
      >
        <span className="mr-2 truncate">{children || label || value}</span>
        {selected ? <Check className="ml-auto size-4 shrink-0" /> : null}
      </CommandItem>
    );
  },
);

MultiSelectItem.displayName = 'MultiSelectItem';

const MultiSelectGroup = React.forwardRef<
  React.ComponentRef<typeof CommandGroup>,
  React.ComponentPropsWithoutRef<typeof CommandGroup>
>((props, forwardRef) => {
  return <CommandGroup {...props} ref={forwardRef} />;
});

MultiSelectGroup.displayName = 'MultiSelectGroup';

const MultiSelectSeparator = React.forwardRef<
  React.ComponentRef<typeof CommandSeparator>,
  React.ComponentPropsWithoutRef<typeof CommandSeparator>
>((props, forwardRef) => {
  return <CommandSeparator {...props} ref={forwardRef} />;
});

MultiSelectSeparator.displayName = 'MultiSelectSeparator';

const MultiSelectEmpty = React.forwardRef<
  React.ComponentRef<typeof CommandEmpty>,
  React.ComponentPropsWithoutRef<typeof CommandEmpty>
>(({ children = 'No Content', ...props }, forwardRef) => {
  return (
    <CommandEmpty {...props} ref={forwardRef}>
      {children}
    </CommandEmpty>
  );
});

MultiSelectEmpty.displayName = 'MultiSelectEmpty';

export interface MultiSelectOptionSeparator {
  type: 'separator';
}

export interface MultiSelectOptionGroup {
  heading?: React.ReactNode;
  value?: string;
  children: MultiSelectOption[];
}

export type MultiSelectOption =
  | Pick<MultiSelectItemProps, 'value' | 'label' | 'disabled' | 'onSelect' | 'onDeselect'>
  | MultiSelectOptionSeparator
  | MultiSelectOptionGroup;

function renderMultiSelectOptions(list: MultiSelectOption[]) {
  return list.map((option, index) => {
    if ('type' in option) {
      // biome-ignore lint/suspicious/noArrayIndexKey: part of multi-select implementation
      if (option.type === 'separator') return <MultiSelectSeparator key={index} />;

      return null;
    }

    if ('children' in option) {
      return (
        <MultiSelectGroup key={option.value || index} value={option.value} heading={option.heading}>
          {renderMultiSelectOptions(option.children)}
        </MultiSelectGroup>
      );
    }

    return (
      <MultiSelectItem key={option.value} {...option}>
        {option.label}
      </MultiSelectItem>
    );
  });
}

// Simplified API for backend developers
interface SimpleMultiSelectProps {
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
  container?: Element;
}

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
  ...props
}: SimpleMultiSelectProps) {
  // Convert simple string array to option objects
  const normalizedOptions: MultiSelectOption[] = React.useMemo(() => {
    return options.map((option) => {
      if (typeof option === 'string') {
        return { value: option, label: option };
      }
      return option;
    });
  }, [options]);

  return (
    <MultiSelect value={value} onValueChange={onValueChange} disabled={disabled} maxCount={maxCount} {...props}>
      <MultiSelectTrigger id={id} className={cn(widthClasses[width], className)}>
        <MultiSelectValue placeholder={placeholder} maxDisplay={maxDisplay} />
      </MultiSelectTrigger>
      <MultiSelectContent container={container}>
        {searchable && <MultiSelectSearch placeholder="Search..." />}
        <MultiSelectList>{renderMultiSelectOptions(normalizedOptions)}</MultiSelectList>
        <MultiSelectEmpty>No items found</MultiSelectEmpty>
      </MultiSelectContent>
    </MultiSelect>
  );
}

export {
  MultiSelect,
  MultiSelectTrigger,
  MultiSelectValue,
  MultiSelectSearch,
  MultiSelectContent,
  MultiSelectList,
  MultiSelectItem,
  MultiSelectGroup,
  MultiSelectSeparator,
  MultiSelectEmpty,
  renderMultiSelectOptions,
  SimpleMultiSelect,
};
