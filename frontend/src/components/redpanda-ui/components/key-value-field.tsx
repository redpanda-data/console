'use client';

// Copyright 2026 Redpanda Data, Inc.

import { Plus, X } from 'lucide-react';
import { type ReactNode, useId, useRef } from 'react';

import { Button } from './button';
import { Combobox, type ComboboxProps } from './combobox';
import { Input, type InputProps } from './input';
import { hasSlotContent } from '../lib/has-slot-content';
import { findDuplicateIndices } from '../lib/input-utils';
import type { SharedProps } from '../lib/utils';
import { requireDefined } from '../lib/utils/require-defined';

import { createKeyValueRow, haveUniqueRowIds, type KeyValuePair, type KeyValueRow } from './key-value-field/rows';
import { useRowChanges } from './key-value-field/use-row-changes';

export type { KeyValuePair, KeyValueRow } from './key-value-field/rows';

type InputFieldConfig = { mode?: 'input' } & Omit<InputProps, 'value' | 'onChange' | 'disabled' | 'aria-invalid'>;
type ComboboxFieldConfig = { mode: 'combobox' } & Omit<ComboboxProps, 'value' | 'onChange' | 'disabled'>;
export type KeyValueFieldConfig = InputFieldConfig | ComboboxFieldConfig;

export interface KeyValueFieldError {
  key?: string;
  value?: string;
}

export interface KeyValueFieldProps extends SharedProps {
  addButtonLabel?: string | undefined;
  description?: ReactNode | undefined;
  disabled?: boolean | undefined;
  errors?: Array<KeyValueFieldError | undefined>;
  keyFieldProps?: KeyValueFieldConfig | undefined;
  label?: ReactNode | undefined;
  maxItems?: number | undefined;
  onChange?: ((value: KeyValueRow[]) => void) | undefined;
  showAddButton?: boolean | undefined;
  value?: readonly KeyValueRow[] | undefined;
  valueFieldProps?: KeyValueFieldConfig | undefined;
}

function FieldRenderer({
  config,
  value,
  onChange,
  disabled,
  invalid,
  errorId,
  testId,
}: {
  config: KeyValueFieldConfig;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean | undefined;
  invalid: boolean;
  errorId?: string | undefined;
  testId?: string | undefined;
}) {
  const descriptionIds = [config['aria-describedby'], errorId].filter(Boolean).join(' ');
  const describedBy = descriptionIds === '' ? undefined : descriptionIds;
  if (config.mode === 'combobox') {
    const { mode: _m, ...comboboxProps } = config;
    return (
      <Combobox
        {...comboboxProps}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        disabled={disabled}
        onChange={onChange}
        testId={testId}
        value={value}
      />
    );
  }

  const { mode: _, ...inputProps } = config;
  return (
    <Input
      {...inputProps}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      disabled={disabled}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      testId={testId}
      value={value}
    />
  );
}

function ErrorRow({
  keyError,
  valueError,
  keyErrorId,
  valueErrorId,
}: {
  keyError?: string | undefined;
  valueError?: string | undefined;
  keyErrorId: string;
  valueErrorId: string;
}) {
  if ((keyError === undefined || keyError === '') && (valueError === undefined || valueError === '')) {
    return null;
  }
  return (
    <>
      {keyError !== undefined && keyError !== '' ? (
        <p className="-mt-1 text-body text-destructive" id={keyErrorId}>
          {keyError}
        </p>
      ) : (
        <span />
      )}
      {valueError !== undefined && valueError !== '' ? (
        <p className="-mt-1 text-body text-destructive" id={valueErrorId}>
          {valueError}
        </p>
      ) : (
        <span />
      )}
      <span />
    </>
  );
}

function rowTestId(testId: string | undefined, part: string, index?: number) {
  if (testId === undefined || testId === '') {
    return;
  }
  return index === undefined ? `${testId}-${part}` : `${testId}-${part}-${index}`;
}

function KeyValueRowControls({
  pair,
  index,
  isDuplicate,
  isLast,
  error,
  disabled,
  keyFieldProps,
  valueFieldProps,
  testId,
  addButtonLabel,
  onKeyChange,
  onValueChange,
  onDelete,
  onAdd,
}: {
  pair: KeyValuePair;
  index: number;
  isDuplicate: boolean;
  isLast: boolean;
  error?: KeyValueFieldError | undefined;
  disabled?: boolean | undefined;
  keyFieldProps: KeyValueFieldConfig;
  valueFieldProps: KeyValueFieldConfig;
  testId?: string | undefined;
  addButtonLabel: string;
  onKeyChange: (index: number, key: string) => void;
  onValueChange: (index: number, val: string) => void;
  onDelete: (index: number) => void;
  onAdd?: (() => void) | undefined;
}) {
  const rowId = useId();
  const keyErrorId = `${rowId}-key-error`;
  const valueErrorId = `${rowId}-value-error`;
  const keyError = isDuplicate ? 'Duplicate key' : error?.key;
  const isKeyInvalid = (error?.key ?? '') !== '' || (pair.value !== '' && pair.key === '') || isDuplicate;
  const isValueInvalid = (error?.value ?? '') !== '' || (pair.key !== '' && pair.value === '');

  return (
    <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2" data-row>
      <FieldRenderer
        config={keyFieldProps}
        disabled={disabled}
        errorId={keyError !== undefined && keyError !== '' ? keyErrorId : undefined}
        invalid={isKeyInvalid}
        onChange={(val) => {
          onKeyChange(index, val);
        }}
        testId={rowTestId(testId, 'key', index)}
        value={pair.key}
      />
      <FieldRenderer
        config={valueFieldProps}
        disabled={disabled}
        errorId={(error?.value ?? '') === '' ? undefined : valueErrorId}
        invalid={isValueInvalid}
        onChange={(val) => {
          onValueChange(index, val);
        }}
        testId={rowTestId(testId, 'value', index)}
        value={pair.value}
      />
      <Button
        aria-label="Delete key-value pair"
        data-testid={rowTestId(testId, 'delete', index)}
        disabled={disabled}
        onClick={() => {
          onDelete(index);
        }}
        size="icon-sm"
        variant="ghost"
      >
        <X size={16} />
      </Button>
      <ErrorRow keyError={keyError} keyErrorId={keyErrorId} valueError={error?.value} valueErrorId={valueErrorId} />
      {onAdd !== undefined && isLast ? (
        <Button
          className="col-span-2"
          data-slot="add-button"
          data-testid={rowTestId(testId, 'add')}
          disabled={disabled}
          onClick={onAdd}
          size="sm"
          variant="outline"
        >
          <Plus size={14} />
          {addButtonLabel}
        </Button>
      ) : null}
    </div>
  );
}

const EMPTY_ROWS: KeyValueRow[] = [];
const DEFAULT_KEY_FIELD: KeyValueFieldConfig = { placeholder: 'Key' };
const DEFAULT_VALUE_FIELD: KeyValueFieldConfig = { placeholder: 'Value' };

export function KeyValueField({
  value = EMPTY_ROWS,
  onChange,
  errors,
  label,
  description,
  addButtonLabel = 'Add',
  keyFieldProps = DEFAULT_KEY_FIELD,
  valueFieldProps = DEFAULT_VALUE_FIELD,
  showAddButton = true,
  disabled,
  maxItems,
  testId,
}: KeyValueFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { change, error } = useRowChanges(value, onChange, containerRef);
  if (!haveUniqueRowIds(value)) {
    return (
      <p role="alert">Each key-value row needs a unique, non-empty id. Create rows once with createKeyValueRows().</p>
    );
  }
  const duplicateIndices = findDuplicateIndices([...value], (row) => row.pair.key);

  const isAtLimit = maxItems !== undefined && value.length >= maxItems;

  const handleAdd = () => {
    change([...value, createKeyValueRow({ key: '', value: '' })], { type: 'add' });
  };

  const handleKeyChange = (index: number, key: string) => {
    const updated = [...value];
    const row = requireDefined(updated[index], 'Expected a key/value row');
    updated[index] = { ...row, pair: { ...row.pair, key } };
    change(updated);
  };

  const handleValueChange = (index: number, val: string) => {
    const updated = [...value];
    const row = requireDefined(updated[index], 'Expected a key/value row');
    updated[index] = { ...row, pair: { ...row.pair, value: val } };
    change(updated);
  };

  const handleDelete = (index: number) => {
    const updated = [...value];
    updated.splice(index, 1);
    change(updated, { type: 'remove', index });
  };

  return (
    <div className="flex flex-col gap-2" data-slot="key-value-field" data-testid={testId} ref={containerRef}>
      {error === undefined ? null : <p role="alert">{error}</p>}
      {hasSlotContent(label) || hasSlotContent(description) ? (
        <div className="flex flex-col gap-0.5">
          {hasSlotContent(label) ? <p className="flex items-center gap-2 text-label select-none">{label}</p> : null}
          {hasSlotContent(description) ? <p className="text-body text-subtle">{description}</p> : null}
        </div>
      ) : null}
      {value.map((row, index) => (
        <KeyValueRowControls
          addButtonLabel={addButtonLabel}
          disabled={disabled}
          error={errors?.[index]}
          index={index}
          isDuplicate={duplicateIndices.has(index)}
          isLast={index === value.length - 1}
          key={row.id}
          keyFieldProps={keyFieldProps}
          onAdd={showAddButton && !isAtLimit ? handleAdd : undefined}
          onDelete={handleDelete}
          onKeyChange={handleKeyChange}
          onValueChange={handleValueChange}
          pair={row.pair}
          testId={testId}
          valueFieldProps={valueFieldProps}
        />
      ))}
      {value.length === 0 && showAddButton && !isAtLimit ? (
        <Button
          data-slot="add-button"
          data-testid={testId !== undefined && testId !== '' ? `${testId}-add` : undefined}
          disabled={disabled}
          onClick={handleAdd}
          size="sm"
          variant="outline"
        >
          <Plus size={14} />
          {addButtonLabel}
        </Button>
      ) : null}
    </div>
  );
}
