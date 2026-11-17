'use client';

// Copyright 2026 Redpanda Data, Inc.

import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { useFieldControl } from '@ui-sdk/react/field';
import { usePart, usePrimitive } from '@ui-sdk/react/primitive';
import { commitAgentChange } from '../../lib/commit-agent-change';
import { baseComboboxAgent } from '../../lib/primitives/base-value-agent';
import { Check, ChevronsUpDown, Plus, Search, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { buttonVariants } from '../button';
import { inputVariants } from '../input';
import { Spinner } from '../spinner';
import { usePortalContainer } from '../../lib/use-portal-container';
import { cn, type PortalContentProps, type PortalRootProps, type SharedProps } from '../../lib/utils';

import {
  buildListGroups,
  type ComboboxCreateItem,
  type ComboboxListGroup,
  type ComboboxListItem,
  CREATE_ITEM_VALUE,
  canCreateOption,
  isCreateItem,
} from './combobox-utils';

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

type InputChangeReason = ComboboxPrimitive.Root.ChangeEventReason;

const DEFAULT_START = <Search className="opacity-50" size={15} />;

/** Input changes the user made; every other reason is Base UI syncing the text to the selection. */
const USER_INPUT_REASONS: ReadonlySet<InputChangeReason> = new Set(['input-change', 'clear-press', 'escape-key']);
/** Base UI restoring the selected label, e.g. after the popup closes without a selection. */
const SYNC_INPUT_REASONS: ReadonlySet<InputChangeReason> = new Set(['none', 'input-clear']);

const getItemValue = (item: ComboboxListItem) => item.value;
const getItemLabel = (item: ComboboxListItem) => item.label;

const itemClassName =
  "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-body outline-hidden data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0";

function ComboboxOptionItem({
  option,
  renderOption,
}: {
  option: ComboboxOption;
  renderOption: ComboboxProps['renderOption'];
}) {
  return (
    <ComboboxPrimitive.Item
      className={itemClassName}
      data-slot="combobox-item"
      data-testid={option.testId}
      disabled={option.disabled}
      value={option.value}
    >
      {renderOption ? renderOption(option) : option.label}
      <Check className="ml-auto in-data-[selected]:opacity-100 opacity-0" />
    </ComboboxPrimitive.Item>
  );
}

function ComboboxCreateOptionItem({ item }: { item: ComboboxCreateItem }) {
  return (
    <ComboboxPrimitive.Item className={itemClassName} data-slot="combobox-create-item" value={item.value}>
      <Plus className="size-4 shrink-0" />
      <span className="truncate">Create "{item.label}"</span>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxGroup({
  group,
  renderOption,
}: {
  group: ComboboxListGroup;
  renderOption: ComboboxProps['renderOption'];
}) {
  return (
    <ComboboxPrimitive.Group
      className="overflow-hidden p-1 text-foreground"
      data-slot="combobox-group"
      data-testid={group.testId}
      items={group.items}
      // Options without a `group` share an unnamed section that adds no grouping semantics.
      role={group.heading ? 'group' : 'presentation'}
    >
      {group.heading ? (
        <ComboboxPrimitive.GroupLabel
          className="px-2 py-1.5 font-medium text-body-sm text-subtle"
          data-slot="combobox-group-label"
        >
          {group.heading}
        </ComboboxPrimitive.GroupLabel>
      ) : null}
      <ComboboxPrimitive.Collection>
        {(item: ComboboxListItem) =>
          isCreateItem(item) ? (
            <ComboboxCreateOptionItem item={item} key={item.value} />
          ) : (
            <ComboboxOptionItem key={item.value} option={item} renderOption={renderOption} />
          )
        }
      </ComboboxPrimitive.Collection>
    </ComboboxPrimitive.Group>
  );
}

function ComboboxAgentInput({
  field,
  ...props
}: ComboboxPrimitive.Input.Props & { field: ReturnType<typeof useFieldControl> }) {
  return usePart(
    baseComboboxAgent,
    'trigger',
    {},
    { render: <ComboboxPrimitive.Input {...(field ? field.props(props) : props)} /> },
    'input'
  );
}

/** `value` when controlled; without the prop the combobox keeps the pick itself, as it did before Base UI. */
function useComboboxValue(valueProp: string | undefined) {
  const [uncontrolledValue, setUncontrolledValue] = useState('');
  const isControlled = valueProp !== undefined;
  const [wasControlled, setWasControlled] = useState(isControlled);
  if (wasControlled !== isControlled) {
    setWasControlled(isControlled);
    // Dropping `value` means "no selection", not whatever was last picked while it was controlled.
    if (!isControlled) {
      setUncontrolledValue('');
    }
  }
  return [valueProp ?? uncontrolledValue, setUncontrolledValue] as const;
}

/** Focus moving into the popup, as a press on one of its rows can do, is not leaving the combobox. */
function isFocusLeaving(event: React.FocusEvent, popup: HTMLElement | null) {
  return !(event.relatedTarget instanceof Node && popup?.contains(event.relatedTarget));
}

/** Names the listbox like the input: by `aria-label`, by `aria-labelledby`, or a generic fallback. */
function listboxLabel(ariaLabel: string | undefined, ariaLabelledBy: string | undefined) {
  return ariaLabel ?? (ariaLabelledBy ? undefined : 'Suggestions');
}

export const Combobox = ({
  options,
  value: valueProp,
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
  onInputValueChange,
  isLoading = false,
  emptyState,
  renderOption,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: ComboboxProps) => {
  const field = useFieldControl({ id });
  disabled = disabled || field?.disabled;
  const portalContainer = usePortalContainer();
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<ComboboxPrimitive.Root.Actions>(null);
  const highlightedValueRef = useRef<string | undefined>(undefined);
  const { contains } = ComboboxPrimitive.useFilter();
  const [open, setOpen] = useState(defaultOpen);
  const [value, setUncontrolledValue] = useComboboxValue(valueProp);
  // Remembers the picked option so its label survives async results that no longer include it.
  const [lastSelected, setLastSelected] = useState<ComboboxOption>();

  const selectedOption = options.find((option) => option.value === value) ?? lastSelected;
  const selectedLabel = selectedOption?.value === value ? selectedOption.label : value;

  // The input text is owned here so a creatable combobox can keep typed text Base UI would revert.
  const [inputValue, setInputValue] = useState(selectedLabel);
  const [synced, setSynced] = useState({ value, label: selectedLabel });
  if (synced.value !== value || synced.label !== selectedLabel) {
    setSynced({ value, label: selectedLabel });
    // A new value always shows its label; a relabel only replaces text the user has not edited.
    if (synced.value !== value || inputValue === synced.label) {
      setInputValue(selectedLabel);
    }
  }

  const canCreate = !!creatable && canCreateOption(options, inputValue, value);
  const items = ComboboxPrimitive.createItems(buildListGroups(options, canCreate ? inputValue.trim() : undefined), {
    getValue: getItemValue,
    getLabel: getItemLabel,
  });

  useEffect(
    function focusInputOnDefaultOpen() {
      if (defaultOpen && !preventAutoFocusOnOpen) {
        inputRef.current?.focus();
      }
    },
    [defaultOpen, preventAutoFocusOnOpen]
  );

  const matchesQuery = (item: ComboboxListItem, query: string) =>
    isCreateItem(item) || contains(item.label, query) || contains(item.value, query);

  const applyValue = (nextValue: string) => {
    if (nextValue === value) {
      return;
    }
    const option = options.find((candidate) => candidate.value === nextValue);
    if (option) {
      setLastSelected(option);
    }
    setUncontrolledValue(nextValue);
    onChange(nextValue);
  };

  const handle = usePrimitive(baseComboboxAgent, {
    value: value || null,
    disabled,
    items: options,
    valid: (value) => value === null || typeof value === 'string',
    onValueChange: (next, details) => commitAgentChange(() => applyValue(next ?? ''), next, details),
  });
  const commitValue = (next: string, event?: Event) => handle.api.setValue(next || null, event);

  const commitCreate = () => {
    const text = inputValue.trim();
    setInputValue(text);
    setUncontrolledValue(text);
    onChange(text);
    onCreateOption?.(text);
  };

  const handleValueChange = (nextValue: string | null, details: ComboboxPrimitive.Root.ChangeEventDetails) => {
    // Only the create row means "create": an option may carry the same string as its own value.
    if (canCreate && nextValue === CREATE_ITEM_VALUE) {
      commitCreate();
      return;
    }
    // Clicking the selected option again clears it. Enter keeps it: opening highlights the selection.
    const togglesOff =
      details.reason === 'item-press' && nextValue === value && !(details.event instanceof KeyboardEvent);
    if (!commitValue(togglesOff ? '' : (nextValue ?? ''), details.event)) details.cancel();
  };

  const handleInputValueChange = (nextInputValue: string, details: ComboboxPrimitive.Root.ChangeEventDetails) => {
    // Creatable: text the user typed for a new option stays put when the popup closes without a pick.
    if (canCreate && SYNC_INPUT_REASONS.has(details.reason)) {
      return;
    }
    setInputValue(nextInputValue);
    if (USER_INPUT_REASONS.has(details.reason)) {
      onInputValueChange?.(nextInputValue);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      onOpen?.();
    } else {
      onClose?.();
    }
  };

  const handleEnterKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Base UI commits a highlighted row itself and keeps the Enter from submitting a form.
    if (open && highlightedValueRef.current !== undefined) {
      return;
    }
    // Closed with nothing to commit: let Enter submit the form as usual.
    if (!(open || canCreate)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (canCreate) {
      commitCreate();
    }
  };

  // ArrowRight with the caret at the end accepts the highlighted option, like inline autocomplete.
  const handleArrowRightKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const highlighted = highlightedValueRef.current;
    if (!open || highlighted === undefined || input.selectionStart !== input.value.length) {
      return;
    }
    const option = options.find((candidate) => candidate.value === highlighted);
    if (!option || option.disabled) {
      return;
    }
    event.preventDefault();
    setInputValue(option.label);
    commitValue(option.value, event.nativeEvent);
    actionsRef.current?.close();
  };

  // Creatable keeps typed text while the input has focus, so Enter can still create it; leaving the
  // field shows the saved selection again instead of text that was never committed.
  const restoreSelectedLabelOnLeave = (event: React.FocusEvent<HTMLInputElement>) => {
    if (canCreate && isFocusLeaving(event, popupRef.current)) {
      setInputValue(selectedLabel);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleEnterKey(event);
    } else if (event.key === 'ArrowRight') {
      handleArrowRightKey(event);
    }
  };

  return usePart(
    handle,
    'root',
    {},
    {
      render: () => (
        <ComboboxPrimitive.Root
          actionsRef={actionsRef}
          autoHighlight
          disabled={disabled}
          filter={matchesQuery}
          id={id}
          inputValue={inputValue}
          items={items}
          // Labels the selected value when the current options no longer contain it.
          itemToStringLabel={(itemValue) => (itemValue === value ? selectedLabel : itemValue)}
          onInputValueChange={handleInputValueChange}
          onItemHighlighted={(itemValue) => {
            highlightedValueRef.current = itemValue;
          }}
          onOpenChange={handleOpenChange}
          onValueChange={handleValueChange}
          open={open}
          value={value || null}
        >
          <div className={cn('relative flex w-full items-center', className)}>
            {start == null ? null : (
              <span className="pointer-events-none absolute left-3 z-10 flex items-center">{start}</span>
            )}
            <ComboboxAgentInput
              field={field}
              aria-label={ariaLabel}
              aria-labelledby={ariaLabelledBy}
              className={cn(inputVariants(), 'relative w-full rounded-md shadow-none pr-14', start != null && 'pl-9')}
              data-testid={inputTestId}
              onBlur={restoreSelectedLabelOnLeave}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              ref={inputRef}
            />
            <span className="absolute right-3 flex items-center gap-1">
              {clearable && !disabled ? (
                <ComboboxPrimitive.Clear
                  aria-label="Clear selection"
                  className={cn(
                    buttonVariants({ size: 'icon-xs', variant: 'ghost' }),
                    'opacity-70 hover:opacity-100 focus-visible:opacity-100'
                  )}
                  data-slot="combobox-clear"
                >
                  <X size={15} />
                </ComboboxPrimitive.Clear>
              ) : null}
              <ChevronsUpDown className="pointer-events-none opacity-50" size={15} />
            </span>
          </div>
          <ComboboxPrimitive.Portal container={container ?? portalContainer}>
            <ComboboxPrimitive.Positioner className="z-50" positionMethod="fixed" sideOffset={4}>
              <ComboboxPrimitive.Popup
                aria-busy={isLoading || undefined}
                className="!border-input w-max min-w-(--anchor-width) max-w-[min(40rem,calc(100vw-2rem))] origin-(--transform-origin) overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md outline-none transition-[opacity,transform] data-[ending-style]:scale-95 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none"
                data-slot="combobox-content"
                data-testid={testId}
                ref={popupRef}
              >
                <ComboboxPrimitive.Status data-slot="combobox-status">
                  {isLoading ? (
                    <div className="flex items-center gap-2 px-3 py-4 text-body text-subtle">
                      <Spinner className="size-4" />
                      <span>Loading…</span>
                    </div>
                  ) : null}
                </ComboboxPrimitive.Status>
                <ComboboxPrimitive.Empty data-slot="combobox-empty">
                  {/* Creatable lists are never empty to the user: the create hint below fills the space. */}
                  {isLoading || creatable ? null : (
                    <div className="py-6 text-center text-body">{emptyState ?? 'No options found.'}</div>
                  )}
                </ComboboxPrimitive.Empty>
                <ComboboxPrimitive.List
                  aria-label={listboxLabel(ariaLabel, ariaLabelledBy)}
                  aria-labelledby={ariaLabelledBy}
                  className="max-h-[min(300px,var(--available-height))] scroll-py-1 overflow-y-auto overflow-x-hidden overscroll-contain outline-none"
                  data-slot="combobox-list"
                >
                  {(group: ComboboxListGroup) => (
                    <ComboboxGroup group={group} key={group.key} renderOption={renderOption} />
                  )}
                </ComboboxPrimitive.List>
                {creatable && !canCreate ? (
                  <div className="p-1" data-slot="combobox-create-hint">
                    <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-body opacity-50">
                      <Plus className="size-4 shrink-0 opacity-50" />
                      <span className="truncate text-subtle">Type to create a new {createLabel}...</span>
                    </div>
                  </div>
                ) : null}
              </ComboboxPrimitive.Popup>
            </ComboboxPrimitive.Positioner>
          </ComboboxPrimitive.Portal>
        </ComboboxPrimitive.Root>
      ),
    },
    'div'
  );
};
