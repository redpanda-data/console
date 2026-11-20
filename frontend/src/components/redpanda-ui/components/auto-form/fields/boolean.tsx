'use client';

import { Badge } from '../../badge';
import { Checkbox } from '../../checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../select';
import { Switch } from '../../switch';
import type { AutoFormFieldProps } from '../core-types';
import { UNSET_SELECT_VALUE } from '../helpers';
import { getControlLabel } from './field-values';
import { useFieldTestIds } from './use-field-test-ids';

function readBooleanValue(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return;
  }
  if (typeof value !== 'boolean') {
    throw new TypeError('Expected a boolean form value.');
  }
  return value;
}

// Tri-state select (true / false / unset).
function renderBooleanSelectedValue(value: unknown) {
  if (value === UNSET_SELECT_VALUE || value === undefined || value === null || value === '') {
    return 'Not set';
  }
  return value === 'true' ? 'True' : 'False';
}

function BooleanFieldComponent({ error, field, id, inputProps, label }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const value = readBooleanValue(inputProps.value);
  const fieldLabel = getControlLabel(label, field);

  return (
    <Select
      onValueChange={(nextValue) => {
        if (nextValue === UNSET_SELECT_VALUE) {
          inputProps.onValueChange(undefined);
          return;
        }
        inputProps.onValueChange(nextValue === 'true');
      }}
      value={value === undefined ? UNSET_SELECT_VALUE : String(value)}
    >
      <SelectTrigger
        aria-invalid={Boolean(error)}
        aria-label={fieldLabel}
        disabled={inputProps.disabled}
        id={id}
        testId={testIds.control}
      >
        <SelectValue placeholder="Choose a value">{renderBooleanSelectedValue}</SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectItem testId={testIds.option('not-set')} value={UNSET_SELECT_VALUE}>
          Not set
        </SelectItem>
        <SelectItem testId={testIds.option('true')} value="true">
          True
        </SelectItem>
        <SelectItem testId={testIds.option('false')} value="false">
          False
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

function CheckboxFieldComponent({ error, field, id, inputProps, label }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const value = readBooleanValue(inputProps.value);

  return (
    <div className="flex min-h-9 items-center">
      <Checkbox
        aria-invalid={Boolean(error)}
        aria-label={getControlLabel(label, field)}
        checked={value ?? false}
        disabled={inputProps.disabled}
        id={id}
        onCheckedChange={(checked) => {
          inputProps.onValueChange(checked);
        }}
        testId={testIds.control}
      />
    </div>
  );
}

function SwitchFieldComponent({ error, field, id, inputProps, label }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const value = readBooleanValue(inputProps.value);

  return (
    <div className="flex min-h-9 items-center">
      <Switch
        aria-invalid={Boolean(error)}
        aria-label={getControlLabel(label, field)}
        checked={value ?? false}
        disabled={inputProps.disabled}
        id={id}
        onCheckedChange={(checked) => {
          inputProps.onValueChange(checked);
        }}
        testId={testIds.control}
      />
    </div>
  );
}

// Not registered by default; available as an override.
function ToggleFieldComponent({ error, field, id, inputProps, label }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const value = readBooleanValue(inputProps.value);

  return (
    <div className="flex min-h-9 items-center gap-3" data-testid={testIds.control}>
      <Switch
        aria-invalid={Boolean(error)}
        aria-label={getControlLabel(label, field)}
        checked={value ?? false}
        disabled={inputProps.disabled}
        id={id}
        onCheckedChange={(checked) => {
          inputProps.onValueChange(checked);
        }}
        testId={testIds.controlPart('switch')}
      />
      <Badge aria-hidden disabled={inputProps.disabled} size="lg" variant="outline">
        {value === true ? 'On' : 'Off'}
      </Badge>
    </div>
  );
}

export { BooleanFieldComponent, CheckboxFieldComponent, SwitchFieldComponent, ToggleFieldComponent };
