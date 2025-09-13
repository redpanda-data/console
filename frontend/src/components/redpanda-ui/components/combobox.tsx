'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from './command';
import { Input, InputEnd } from './input';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { cn } from '../lib/utils';

export type ComboboxOption = {
  value: string;
  label: string;
};

export function Combobox({
  options,
  value: controlledValue,
  onChange,
  placeholder,
  disabled,
  creatable,
  autocomplete = true,
  onCreateOption,
}: {
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
}) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(controlledValue ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // Only focus when popover opens, not when it closes
  useEffect(() => {
    if (inputRef.current && open) {
      // Small timeout to ensure DOM is ready
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Sync internal inputValue with external controlledValue
  useEffect(() => {
    if (controlledValue !== undefined) {
      setInputValue(controlledValue);
    }
  }, [controlledValue]);

  // Find the best matching option for autocomplete
  const bestMatchOption = useMemo(() => {
    if (!inputValue || !autocomplete) return undefined;

    // First priority: exact value match
    const exactValueMatch = options.find((option) => option.value.toLowerCase() === inputValue.toLowerCase());
    if (exactValueMatch) return exactValueMatch;

    // Second priority: exact label match
    const exactLabelMatch = options.find((option) => option.label.toLowerCase() === inputValue.toLowerCase());
    if (exactLabelMatch) return exactLabelMatch;

    // Third priority: label starts with input (best for autocomplete)
    const startsWithMatch = options.find((option) => option.label.toLowerCase().startsWith(inputValue.toLowerCase()));
    if (startsWithMatch) return startsWithMatch;

    // Last priority: label contains input
    const containsMatch = options.find((option) => option.label.toLowerCase().includes(inputValue.toLowerCase()));
    return containsMatch || null;
  }, [options, inputValue, autocomplete]);

  const displayContent = useMemo(() => {
    if (!inputValue) return placeholder;

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

  const handleKeyDown = useCallback(
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
        }
      } else if (event.key === 'Escape') {
        setOpen(false);
      }
    },
    [bestMatchOption, onChange, creatable, inputValue, options, handleCreatableSubmit],
  );

  const handlePopoverOpenChange = useCallback(
    (newOpen: boolean) => {
      if (disabled) return;
      setOpen(newOpen);
    },
    [disabled],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
      if (!open) setOpen(true);
    },
    [open],
  );

  const handleInputClick = useCallback(() => {
    if (!open) setOpen(true);
  }, [open]);

  const filteredOptions = useMemo(() => {
    if (!inputValue) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(inputValue.toLowerCase()) ||
        option.value.toLowerCase().includes(inputValue.toLowerCase()),
    );
  }, [options, inputValue]);

  return (
    <Popover open={open} onOpenChange={handlePopoverOpenChange}>
      <PopoverTrigger asChild>
        <Input
          placeholder={placeholder}
          className="w-full shadow-none text-transparent placeholder:text-transparent caret-foreground relative selection:text-transparent"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onClick={handleInputClick}
          role="combobox"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-autocomplete="list"
          type="text"
          disabled={disabled}
          aria-controls={listId}
          aria-expanded={open}
          ref={inputRef}
        >
          <div
            className={cn(
              'text-foreground absolute left-3 top-1/2 -translate-y-1/2 flex justify-between w-full pointer-events-none min-w-0 border-1 !border-transparent bg-transparent',
              !inputValue && !bestMatchOption && 'text-muted-foreground',
              'selection:bg-selection selection:text-selection-foreground bg-transparent text-base md:text-sm',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            {displayContent}
            <InputEnd className="right-6">
              <ChevronsUpDown className="opacity-50" size={15} />
            </InputEnd>
          </div>
        </Input>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{
          width: inputRef.current?.clientWidth,
        }}
      >
        <Command size="full" loop shouldFilter={false}>
          <CommandList id={listId}>
            <CommandEmpty>No options found.</CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                    setInputValue(option.value);
                  }}
                >
                  {option.label}
                  <Check className={cn('ml-auto', controlledValue === option.value ? 'opacity-100' : 'opacity-0')} />
                </CommandItem>
              ))}
              {creatable && inputValue.length > 0 && !options.some((option) => option.value === inputValue) && (
                <CommandItem key={inputValue} value={inputValue} onSelect={handleCreatableSubmit}>
                  Create "{inputValue}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
