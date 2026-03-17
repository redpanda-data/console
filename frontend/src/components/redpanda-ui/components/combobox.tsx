'use client';

import { Check, ChevronsUpDown, Plus, Search } from 'lucide-react';
import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from './command';
import { Input, InputEnd, InputStart } from './input';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { cn, type PortalContentProps, type PortalRootProps, type SharedProps } from '../lib/utils';

export type ComboboxOption = {
  value: string;
  label: string;
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
  /** @default true - If true, the combobox will autocomplete the input value will show suggestions for matching options, and when the user presses enter or tab */
  autocomplete?: boolean;
  /** If true, the combobox will allow the user to create a new option, similar to a free text input */
  creatable?: boolean;
  /** Callback function to create a new option */
  onCreateOption?: (value: string) => void;
  /** Noun used in the create prompt (e.g. "option", "context"). @default "option" */
  createLabel?: string;
  /** Content for the start slot of the input. Defaults to a search icon. Pass `null` to hide. */
  start?: React.ReactNode | null;
  className?: string;
  onOpen?: () => void;
  onClose?: () => void;
  preventAutoFocusOnOpen?: boolean;
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
    autocomplete = true,
    onCreateOption,
    createLabel = 'option',
    start = DEFAULT_START,
    className,
    onOpen,
    onClose,
    container,
    testId,
    defaultOpen = false,
    preventAutoFocusOnOpen = false,
  }: ComboboxProps) => {
    const [open, setOpen] = useState(defaultOpen);
    const [inputValue, setInputValue] = useState(controlledValue);
    const inputRef = useRef<HTMLInputElement>(null);
    const listId = useId();
    const hasStart = start !== null && start !== undefined;

    // Sync inputValue when controlled value changes externally
    useEffect(() => {
      setInputValue(controlledValue);
    }, [controlledValue]);

    // Only focus when popover opens, not when it closes
    useEffect(() => {
      if (inputRef.current && open && !preventAutoFocusOnOpen) {
        // Small timeout to ensure DOM is ready
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            const length = inputRef.current.value.length;
            inputRef.current.setSelectionRange(length, length);
          }
        }, 0);
      }
    }, [open, preventAutoFocusOnOpen]);

    // Find the best matching option for autocomplete
    const bestMatchOption = useMemo(() => {
      if (!(inputValue && autocomplete)) {
        return;
      }

      // First priority: exact value match
      const exactValueMatch = options.find((option) => option.value.toLowerCase() === inputValue.toLowerCase());
      if (exactValueMatch) {
        return exactValueMatch;
      }

      // Second priority: exact label match
      const exactLabelMatch = options.find((option) => option.label.toLowerCase() === inputValue.toLowerCase());
      if (exactLabelMatch) {
        return exactLabelMatch;
      }

      // Third priority: label starts with input (best for autocomplete)
      const startsWithMatch = options.find((option) => option.label.toLowerCase().startsWith(inputValue.toLowerCase()));
      if (startsWithMatch) {
        return startsWithMatch;
      }
    }, [options, inputValue, autocomplete]);

    const displayContent = useMemo(() => {
      if (!inputValue || inputValue === '') {
        return placeholder;
      }

      if (!bestMatchOption) {
        return inputValue;
      }

      const label = bestMatchOption.label;
      const lowerLabel = label.toLowerCase();
      const lowerInput = inputValue.toLowerCase();

      if (lowerLabel === lowerInput) {
        return label;
      }

      const matchIndex = lowerLabel.indexOf(lowerInput);
      if (matchIndex === -1) {
        return label;
      }

      const before = label.slice(0, matchIndex);
      const match = label.slice(matchIndex, matchIndex + inputValue.length);
      const after = label.slice(matchIndex + inputValue.length);

      return (
        <span>
          {before}
          <span className="font-bold">{match}</span>
          {after}
        </span>
      );
    }, [inputValue, bestMatchOption, placeholder]);

    const handleCreatableSubmit = useCallback(() => {
      onChange(inputValue);
      setOpen(false);
      setInputValue(inputValue);
      onCreateOption?.(inputValue);
    }, [inputValue, onChange, onCreateOption]);

    const handleBlur = useCallback(() => {
      if (inputValue !== controlledValue) {
        const matchesOption = options.some((opt) => opt.value === inputValue || opt.label === inputValue);

        if (!creatable || (!matchesOption && inputValue.trim() === '')) {
          setInputValue(controlledValue ?? '');
        }
      }
    }, [inputValue, controlledValue, options, creatable]);

    const handleKeyDown = useCallback(
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: part of combobox implementation
      (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowRight' || event.key === 'Tab') {
          event.preventDefault();
          if (bestMatchOption) {
            onChange(bestMatchOption.value);
            setOpen(false);
            setInputValue(bestMatchOption.value);
            return;
          }
        } else if (event.key === 'Enter') {
          if (creatable && inputValue.length > 0 && !options.some((option) => option.value === inputValue)) {
            handleCreatableSubmit();
          } else if (bestMatchOption) {
            onChange(bestMatchOption.value);
            setOpen(false);
            setInputValue(bestMatchOption.value);
          } else if (!creatable) {
            setInputValue(controlledValue ?? '');
            setOpen(false);
          }
        } else if (event.key === 'Escape') {
          setOpen(false);
        }
      },
      [bestMatchOption, onChange, creatable, inputValue, options, handleCreatableSubmit, controlledValue]
    );

    const handlePopoverOpenChange = useCallback(
      (newOpen: boolean) => {
        if (disabled) {
          return;
        }
        setOpen(newOpen);
        if (newOpen) {
          onOpen?.();
        } else {
          onClose?.();
        }
      },
      [disabled, onOpen, onClose]
    );

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
        if (!open) {
          setOpen(true);
        }
      },
      [open]
    );

    const handleInputClick = useCallback(() => {
      if (!open) {
        setOpen(true);
        setInputValue('');
      }
    }, [open]);

    const filteredOptions = useMemo(() => {
      if (!inputValue) {
        return options;
      }
      return options.filter(
        (option) =>
          option.label.toLowerCase().includes(inputValue.toLowerCase()) ||
          option.value.toLowerCase().includes(inputValue.toLowerCase())
      );
    }, [options, inputValue]);

    const canCreate =
      creatable && inputValue.trim().length > 0 && !options.some((option) => option.value === inputValue);

    return (
      <Popover onOpenChange={handlePopoverOpenChange} open={open} testId={testId}>
        <PopoverTrigger asChild>
          <Input
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={open}
            autoComplete="off"
            autoCorrect="off"
            className="placeholder:!text-transparent relative w-full text-transparent caret-foreground shadow-none selection:text-transparent"
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
            type="text"
            value={inputValue}
          >
            {hasStart ? <InputStart>{start}</InputStart> : null}
            <div
              className={cn(
                '!border-transparent pointer-events-none absolute top-1/2 flex w-full min-w-0 -translate-y-1/2 justify-between border-1 bg-transparent text-foreground',
                hasStart ? 'left-8' : 'left-3',
                !(inputValue || bestMatchOption) && 'text-muted-foreground',
                'bg-transparent text-base selection:bg-selection selection:text-selection-foreground md:text-sm',
                disabled && 'cursor-not-allowed opacity-50'
              )}
            >
              {displayContent}
            </div>
            <InputEnd>
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
          <Command loop shouldFilter={false} size="full" variant="minimal">
            <CommandList id={listId}>
              <CommandEmpty>No options found.</CommandEmpty>
              <CommandGroup>
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                      setInputValue(option.value);
                    }}
                    value={option.label}
                  >
                    {option.label}
                    <Check className={cn('ml-auto', controlledValue === option.value ? 'opacity-100' : 'opacity-0')} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          {creatable ? (
            <div className="border-border border-t">
              <button
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors',
                  canCreate ? 'cursor-pointer text-foreground hover:bg-accent' : 'cursor-default text-muted-foreground'
                )}
                disabled={!canCreate}
                onClick={canCreate ? handleCreatableSubmit : undefined}
                onMouseDown={(e) => e.preventDefault()}
                type="button"
              >
                <Plus className="size-4 shrink-0" />
                <span className="truncate">
                  {canCreate ? `Create "${inputValue}"` : `Type to create a new ${createLabel}...`}
                </span>
              </button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    );
  }
);
