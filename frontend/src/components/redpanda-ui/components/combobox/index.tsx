// Copyright 2026 Redpanda Data, Inc.

'use client';

import { commitAgentChange } from '../../lib/commit-agent-change';
import * as ComboboxPrimitive from '@ui-sdk/react/combobox';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { groupOptions } from './combobox-utils';
import { usePortalContainer } from '../../lib/use-portal-container';
import { cn, type PortalContentProps, type PortalRootProps, type SharedProps } from '../../lib/utils';
import { useFieldContext } from '../field';
import { inputVariants } from '../input';
import { Spinner } from '../spinner';

export interface ComboboxOption {
  /** Arbitrary payload passed back to `renderOption` for rich item rendering. */
  data?: unknown;
  /** When true, the option is rendered but cannot be selected. */
  disabled?: boolean;
  group?: string;
  groupTestId?: string;
  label: string;
  testId?: string;
  value: string;
}

export interface ComboboxProps
  extends SharedProps,
    Pick<PortalRootProps, 'defaultOpen'>,
    Pick<PortalContentProps, 'container'> {
  /** Names the control when no visible label points at it. Set on the inner input. */
  'aria-label'?: string;
  /** Ids of the elements that name the control, for a label the component does not render. */
  'aria-labelledby'?: string;
  className?: string;
  /** @default true - Show a clear (X) button when a value is selected */
  clearable?: boolean;
  /** Allow the user to create a new option. */
  creatable?: boolean;
  /** Noun used in the create prompt (e.g. "option", "context"). @default "option" */
  createLabel?: string;
  disabled?: boolean;
  /** Override the "No options found." empty state. Ignored when `isLoading`. */
  emptyState?: React.ReactNode;
  /** Set on the inner input, so a sibling `<label htmlFor>` both associates with it and names it. */
  id?: string;
  inputTestId?: string;
  /** Shows an inline spinner and suppresses the empty state while async options load. */
  isLoading?: boolean;
  onChange: (value: string) => void;
  onClose?: () => void;
  onCreateOption?: (value: string) => void;
  /** Fires when the user edits the input text; drive async/remote search from here. */
  onInputValueChange?: (value: string) => void;
  onOpen?: () => void;
  options: ComboboxOption[];
  placeholder?: string;
  /** Keeps a `defaultOpen` combobox from focusing its input on mount. */
  preventAutoFocusOnOpen?: boolean;
  /** Override each option row's render. The active check icon is still rendered by the component. */
  renderOption?: (option: ComboboxOption) => React.ReactNode;
  /** Content for the start slot of the input. Defaults to a search icon. Pass `null` to hide. */
  start?: React.ReactNode | null;
  value?: string;
}

export function Combobox({
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  className,
  clearable = true,
  creatable = false,
  createLabel: _createLabel = 'option',
  disabled,
  emptyState = 'No options found.',
  id,
  inputTestId,
  isLoading,
  onChange,
  onClose,
  onCreateOption,
  onInputValueChange,
  onOpen,
  options,
  placeholder = 'Select an option...',
  preventAutoFocusOnOpen,
  renderOption,
  start,
  value: valueProp,
  defaultOpen,
  container,
  testId,
}: ComboboxProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState('');
  const value = valueProp ?? uncontrolledValue;
  const portalContainer = usePortalContainer();
  const field = useFieldContext();
  const groups = groupOptions(options);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (defaultOpen && !preventAutoFocusOnOpen) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [defaultOpen, preventAutoFocusOnOpen]);
  return (
    <ComboboxPrimitive.Combobox<string, false>
      defaultOpen={defaultOpen}
      disabled={disabled}
      filter={onInputValueChange ? false : 'contains'}
      items={options.map((option) => ({ value: option.value, label: option.label, disabled: option.disabled }))}
      onOpenChange={(open) => {
        if (open) {
          onOpen?.();
        } else {
          onClose?.();
        }
      }}
      onQueryChange={(query, details) => {
        if (details.reason === 'input-change' || details.source === 'agent' || details.reason === 'clear-press') {
          onInputValueChange?.(query);
        }
      }}
      onValueChange={(next, details) => {
        if (!clearable && next === null) {
          details.cancel();
          return;
        }
        const selected = next ?? '';
        commitAgentChange(
          () => {
            if (valueProp === undefined) setUncontrolledValue(selected);
            onChange(selected);
          },
          selected,
          details
        );
      }}
      status={isLoading ? 'loading' : 'idle'}
      value={value || null}
    >
      <div className={cn('relative flex w-full items-center', className)} data-testid={testId}>
        {start === null ? null : (
          <span aria-hidden="true" className="pointer-events-none absolute left-3 flex items-center text-subtle">
            {start ?? <Search className="size-4" />}
          </span>
        )}
        <ComboboxPrimitive.ComboboxInput
          aria-invalid={field.invalid || undefined}
          aria-describedby={field.errorId}
          render={(inputProps) => <input {...inputProps} id={id ?? inputProps.id} />}
          aria-label={ariaLabel ?? (ariaLabelledBy || id ? undefined : placeholder)}
          aria-labelledby={ariaLabelledBy}
          className={cn(inputVariants(), 'rounded-md pr-16', start !== null && 'pl-9')}
          data-testid={inputTestId ?? testId}
          id={id}
          placeholder={placeholder}
          ref={inputRef}
        />
        <div className="absolute right-2 flex items-center gap-1">
          {isLoading ? <Spinner className="size-4" /> : null}
          {clearable ? (
            <ComboboxPrimitive.ComboboxClear
              aria-label="Clear selection"
              className="cursor-pointer rounded-sm p-1 text-subtle hover:bg-accent"
            >
              <X className="size-3" />
            </ComboboxPrimitive.ComboboxClear>
          ) : null}
          <ComboboxPrimitive.ComboboxTrigger
            aria-label="Show options"
            className="cursor-pointer rounded-sm p-1 text-subtle hover:bg-accent"
          >
            <ChevronsUpDown className="size-4" />
          </ComboboxPrimitive.ComboboxTrigger>
        </div>
      </div>
      <ComboboxPrimitive.ComboboxContent
        align="start"
        className="z-50 max-h-(--available-height) min-w-(--anchor-width) overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        container={container ?? portalContainer}
        sideOffset={4}
      >
        <ComboboxPrimitive.ComboboxList>
          {groups.map((group) => (
            <ComboboxPrimitive.ComboboxGroup data-testid={group.testId} key={group.key}>
              {group.heading ? (
                <ComboboxPrimitive.ComboboxGroupLabel className="px-2 py-1.5 text-body-sm font-medium text-subtle">
                  {group.heading}
                </ComboboxPrimitive.ComboboxGroupLabel>
              ) : null}
              {group.items.map((option) => (
                <ComboboxPrimitive.ComboboxItem<string>
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-body outline-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  data-testid={'testId' in option ? option.testId : undefined}
                  disabled={'disabled' in option && option.disabled}
                  key={option.value}
                  label={option.label}
                  value={option.value}
                >
                  {renderOption && !('create' in option) ? renderOption(option) : option.label}
                  <ComboboxPrimitive.ComboboxItemIndicator className="ml-auto">
                    <Check className="size-4" />
                  </ComboboxPrimitive.ComboboxItemIndicator>
                </ComboboxPrimitive.ComboboxItem>
              ))}
            </ComboboxPrimitive.ComboboxGroup>
          ))}
          {creatable ? (
            <ComboboxPrimitive.ComboboxCreate
              className="cursor-pointer rounded-sm px-2 py-1.5 text-body data-highlighted:bg-accent"
              onCreate={(query) => {
                onCreateOption?.(query);
                if (valueProp === undefined) setUncontrolledValue(query);
                onChange(query);
              }}
            >
              {(state) => `Create "${state.query}"`}
            </ComboboxPrimitive.ComboboxCreate>
          ) : null}
        </ComboboxPrimitive.ComboboxList>
        {isLoading ? null : (
          <ComboboxPrimitive.ComboboxEmpty className="p-4 text-center text-body text-subtle">
            {emptyState}
          </ComboboxPrimitive.ComboboxEmpty>
        )}
      </ComboboxPrimitive.ComboboxContent>
    </ComboboxPrimitive.Combobox>
  );
}
