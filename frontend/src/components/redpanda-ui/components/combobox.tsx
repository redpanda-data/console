'use client';

import { useCommandState } from 'cmdk';
import { Check, ChevronsUpDown, Plus, Search, X } from 'lucide-react';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from './command';
import { Input, InputEnd, InputStart } from './input';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { cn, type PortalContentProps, type PortalRootProps, type SharedProps } from '../lib/utils';

/**
 * Sentinel value to prevent cmdk from auto-selecting the first item.
 * cmdk auto-selects when value is falsy, so this truthy value that
 * matches no real option prevents any highlight on open.
 */
const NO_HIGHLIGHT = '__no_highlight__';

/** Prefix for the creatable item's cmdk value to distinguish from real options. */
const CREATE_ITEM_PREFIX = '__create__';

/**
 * Bridge component rendered inside <Command> to read cmdk's internal
 * selectedItemId via useCommandState (requires Command context).
 * Reports the DOM id of the highlighted item for aria-activedescendant.
 */
function ActiveDescendantBridge({ onIdChange }: { onIdChange: (id: string | undefined) => void }) {
  const selectedItemId = useCommandState((state) => state.selectedItemId);
  useEffect(() => {
    onIdChange(selectedItemId);
  }, [selectedItemId, onIdChange]);
  return null;
}

export type ComboboxOption = {
  value: string;
  label: string;
  group?: string;
  groupTestId?: string;
  testId?: string;
};

export interface ComboboxProps
  extends SharedProps,
    Pick<PortalRootProps, 'defaultOpen'>,
    Pick<PortalContentProps, 'container'> {
  options: ComboboxOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** @deprecated No longer used. The combobox now uses list-based navigation. Will be removed in next major version. */
  autocomplete?: boolean;
  /** If true, the combobox will allow the user to create a new option */
  creatable?: boolean;
  /** Callback function to create a new option */
  onCreateOption?: (value: string) => void;
  /** Noun used in the create prompt (e.g. "option", "context"). @default "option" */
  createLabel?: string;
  /** Content for the start slot of the input. Defaults to a search icon. Pass `null` to hide. */
  start?: React.ReactNode | null;
  /** @default true - Show a clear (X) button when a value is selected */
  clearable?: boolean;
  className?: string;
  onOpen?: () => void;
  onClose?: () => void;
  preventAutoFocusOnOpen?: boolean;
  inputTestId?: string;
}

const DEFAULT_START = <Search className="opacity-50" size={15} />;

export const Combobox = memo(
  ({
    options,
    value: controlledValue = '',
    onChange,
    placeholder,
    disabled,
    creatable,
    onCreateOption,
    createLabel = 'option',
    start = DEFAULT_START,
    clearable = true,
    className,
    onOpen,
    onClose,
    container,
    testId,
    defaultOpen = false,
    preventAutoFocusOnOpen = false,
    inputTestId,
  }: ComboboxProps) => {
    const [open, setOpen] = useState(defaultOpen);
    const [inputValue, setInputValue] = useState(() => {
      const opt = options.find((o) => o.value === controlledValue);
      return opt?.label ?? controlledValue;
    });
    const [highlightedValue, setHighlightedValue] = useState('');
    const [activeDescendantId, setActiveDescendantId] = useState<string | undefined>();
    const inputRef = useRef<HTMLInputElement>(null);
    const userHasTypedRef = useRef(false);
    const listId = useId();
    const hasStart = start !== null && start !== undefined;

    // Resolve controlled value to its display label
    const controlledLabel = useMemo(() => {
      const opt = options.find((o) => o.value === controlledValue);
      return opt?.label ?? controlledValue;
    }, [controlledValue, options]);

    // Sync inputValue when controlled value changes externally
    useEffect(() => {
      setInputValue(controlledLabel);
    }, [controlledLabel]);

    // Focus input when popover opens
    useEffect(() => {
      if (!(inputRef.current && open && !preventAutoFocusOnOpen)) {
        return;
      }
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const length = inputRef.current.value.length;
          inputRef.current.setSelectionRange(length, length);
        }
      }, 0);
      return () => clearTimeout(timer);
    }, [open, preventAutoFocusOnOpen]);

    // Fire onOpen/onClose callbacks on state transitions and reset highlight on close
    const prevOpenRef = useRef(open);
    useEffect(() => {
      if (prevOpenRef.current !== open) {
        if (open) {
          onOpen?.();
        } else {
          setHighlightedValue('');
          setActiveDescendantId(undefined);
          onClose?.();
        }
        prevOpenRef.current = open;
      }
    }, [open, onOpen, onClose]);

    const filteredOptions = useMemo(() => {
      if (!inputValue) {
        return options;
      }
      // If input matches the selected option's label exactly, show all options
      if (inputValue === controlledLabel && controlledLabel) {
        return options;
      }
      return options.filter(
        (option) =>
          option.label.toLowerCase().includes(inputValue.toLowerCase()) ||
          option.value.toLowerCase().includes(inputValue.toLowerCase())
      );
    }, [options, inputValue, controlledLabel]);

    const groupedOptions = useMemo(() => {
      if (!filteredOptions.some((option) => option.group)) {
        return;
      }

      const groups = new Map<string, { heading: string; testId?: string; options: ComboboxOption[] }>();
      for (const option of filteredOptions) {
        const groupKey = option.group || '';
        const existing = groups.get(groupKey);
        if (existing) {
          existing.options.push(option);
          continue;
        }
        groups.set(groupKey, {
          heading: groupKey,
          options: [option],
          testId: option.groupTestId,
        });
      }
      return Array.from(groups.values());
    }, [filteredOptions]);

    const canCreate =
      creatable && inputValue.trim().length > 0 && !options.some((option) => option.value === inputValue);

    // Flat list of navigable cmdk values for manual highlight management
    const navigableValues = useMemo(() => {
      const values = filteredOptions.map((opt) => opt.label);
      if (canCreate) {
        values.push(`${CREATE_ITEM_PREFIX}${inputValue}`);
      }
      return values;
    }, [filteredOptions, canCreate, inputValue]);

    const resolveHighlightedOption = useCallback(
      () => filteredOptions.find((o) => o.label.toLowerCase() === highlightedValue.toLowerCase()),
      [filteredOptions, highlightedValue]
    );

    const handleCreatableSubmit = useCallback(() => {
      onChange(inputValue);
      setOpen(false);
      setInputValue(inputValue);
      onCreateOption?.(inputValue);
    }, [inputValue, onChange, onCreateOption]);

    const selectOption = useCallback(
      (option: ComboboxOption) => {
        if (controlledValue === option.value) {
          // Toggle off: clicking the already-selected option clears it
          onChange('');
          setInputValue('');
        } else {
          onChange(option.value);
          setInputValue(option.label);
        }
        setOpen(false);
      },
      [onChange, controlledValue]
    );

    const handleClear = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
        setInputValue('');
        inputRef.current?.focus();
      },
      [onChange]
    );

    const navigateHighlight = useCallback(
      (direction: 1 | -1) => {
        if (navigableValues.length === 0) {
          return;
        }
        const currentIndex = navigableValues.findIndex((v) => v.toLowerCase() === highlightedValue.toLowerCase());
        let nextIndex: number;
        if (currentIndex === -1) {
          nextIndex = direction === 1 ? 0 : navigableValues.length - 1;
        } else {
          nextIndex = currentIndex + direction;
          if (nextIndex < 0) {
            nextIndex = navigableValues.length - 1;
          }
          if (nextIndex >= navigableValues.length) {
            nextIndex = 0;
          }
        }
        setHighlightedValue(navigableValues[nextIndex]);
      },
      [navigableValues, highlightedValue]
    );

    const handleKeyDown = useCallback(
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: combobox keyboard handling requires many branches
      (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (!open) {
            setOpen(true);
            return;
          }
          navigateHighlight(event.key === 'ArrowDown' ? 1 : -1);
        } else if (event.key === 'Enter') {
          if (!open) {
            return; // Let Enter propagate to form when closed
          }
          event.preventDefault();
          event.stopPropagation();

          const isCreateHighlighted = highlightedValue.toLowerCase().startsWith(CREATE_ITEM_PREFIX.toLowerCase());

          if (isCreateHighlighted && canCreate) {
            handleCreatableSubmit();
          } else {
            const option = resolveHighlightedOption();
            if (option) {
              selectOption(option);
            } else if (inputValue.trim() === '' && controlledValue) {
              // Empty input + Enter = clear value
              onChange('');
              setInputValue('');
              setOpen(false);
            } else if (creatable && canCreate) {
              handleCreatableSubmit();
            } else {
              // No highlight, no create — revert and close
              setInputValue(controlledLabel);
              setOpen(false);
            }
          }
        } else if (event.key === 'Escape') {
          if (open) {
            event.preventDefault();
            setOpen(false);
          } else if (controlledValue) {
            // Escape when closed — clear value
            event.preventDefault();
            event.stopPropagation();
            onChange('');
            setInputValue('');
          }
        } else if (event.key === 'ArrowRight') {
          // Only accept suggestion when cursor is at end of input
          const input = inputRef.current;
          if (input && input.selectionStart === input.value.length && open && highlightedValue) {
            const option = resolveHighlightedOption();
            if (option) {
              event.preventDefault();
              selectOption(option);
            }
          }
          // Otherwise let cursor move naturally
        }
        // Tab: no handling — let focus move naturally
      },
      [
        open,
        highlightedValue,
        canCreate,
        handleCreatableSubmit,
        resolveHighlightedOption,
        selectOption,
        navigateHighlight,
        inputValue,
        controlledValue,
        controlledLabel,
        onChange,
        creatable,
      ]
    );

    const handlePopoverOpenChange = useCallback(
      (newOpen: boolean) => {
        if (disabled) {
          return;
        }
        setOpen(newOpen);
        if (newOpen) {
          setHighlightedValue('');
          userHasTypedRef.current = false;
        }
      },
      [disabled]
    );

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setInputValue(newValue);
        userHasTypedRef.current = true;
        if (!open) {
          setOpen(true);
        }
        // Auto-highlight first filtered match when typing
        if (newValue) {
          const lowerValue = newValue.toLowerCase();
          const firstMatch = options.find(
            (opt) => opt.label.toLowerCase().includes(lowerValue) || opt.value.toLowerCase().includes(lowerValue)
          );
          setHighlightedValue(firstMatch?.label ?? '');
        } else {
          setHighlightedValue('');
        }
      },
      [open, options]
    );

    const handleInputClick = useCallback(() => {
      if (!open) {
        setOpen(true);
        setInputValue('');
        userHasTypedRef.current = false;
      }
    }, [open]);

    const handleBlur = useCallback(() => {
      if (inputValue.trim() === '' && controlledValue && userHasTypedRef.current) {
        // User manually cleared input and blurred — clear the value
        onChange('');
        setInputValue('');
      } else if (inputValue !== controlledLabel) {
        const matchesOption = options.some((opt) => opt.value === inputValue || opt.label === inputValue);
        if (!creatable || (!matchesOption && inputValue.trim() === '')) {
          setInputValue(controlledLabel);
        }
      }
      userHasTypedRef.current = false;
    }, [inputValue, controlledValue, controlledLabel, options, creatable, onChange]);

    const showClearButton = clearable && controlledValue && !disabled;

    return (
      <Popover onOpenChange={handlePopoverOpenChange} open={open} testId={testId}>
        <PopoverTrigger asChild>
          <Input
            aria-activedescendant={open ? activeDescendantId : undefined}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={open}
            autoComplete="off"
            autoCorrect="off"
            className="relative w-full shadow-none"
            containerClassName={className}
            disabled={disabled}
            onBlur={handleBlur}
            onChange={handleInputChange}
            onClick={handleInputClick}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            ref={inputRef}
            role="combobox"
            spellCheck={false}
            testId={inputTestId}
            type="text"
            value={inputValue}
          >
            {hasStart ? <InputStart>{start}</InputStart> : null}
            <InputEnd>
              {showClearButton ? (
                <button
                  aria-label="Clear selection"
                  className="pointer-events-auto rounded-sm opacity-50 hover:opacity-100"
                  onClick={handleClear}
                  onMouseDown={(e) => e.preventDefault()}
                  tabIndex={-1}
                  type="button"
                >
                  <X size={15} />
                </button>
              ) : null}
              <ChevronsUpDown className="opacity-50" size={15} />
            </InputEnd>
          </Input>
        </PopoverTrigger>
        <PopoverContent
          className="p-0"
          container={container}
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onOpenAutoFocus={
            preventAutoFocusOnOpen
              ? (e) => {
                  e.preventDefault();
                }
              : undefined
          }
          style={{
            width: inputRef.current?.clientWidth,
          }}
        >
          <Command
            loop
            onValueChange={setHighlightedValue}
            shouldFilter={false}
            size="full"
            value={highlightedValue || NO_HIGHLIGHT}
            variant="minimal"
          >
            <ActiveDescendantBridge onIdChange={setActiveDescendantId} />
            <CommandList id={listId}>
              <CommandEmpty>No options found.</CommandEmpty>
              {(groupedOptions ?? [{ heading: '', options: filteredOptions }]).map((group) => (
                <CommandGroup
                  heading={group.heading || undefined}
                  key={group.heading || 'default'}
                  testId={group.testId}
                >
                  {group.options.map((option) => (
                    <CommandItem
                      key={option.value}
                      onSelect={() => selectOption(option)}
                      testId={option.testId}
                      value={option.label}
                    >
                      {option.label}
                      <Check
                        className={cn('ml-auto', controlledValue === option.value ? 'opacity-100' : 'opacity-0')}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              {canCreate ? (
                <CommandGroup>
                  <CommandItem forceMount onSelect={handleCreatableSubmit} value={`${CREATE_ITEM_PREFIX}${inputValue}`}>
                    <Plus className="size-4 shrink-0" />
                    <span className="truncate">Create "{inputValue}"</span>
                  </CommandItem>
                </CommandGroup>
              ) : null}
              {creatable && !canCreate ? (
                <CommandGroup>
                  <CommandItem disabled forceMount value="__create_prompt__">
                    <Plus className="size-4 shrink-0 opacity-50" />
                    <span className="truncate text-muted-foreground">Type to create a new {createLabel}...</span>
                  </CommandItem>
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }
);
