'use client';

// Copyright 2026 Redpanda Data, Inc.

import { RadioGroup, RadioGroupItem } from '../../radio-group';
import { hasSlotContent } from '../../../lib/has-slot-content';
import type { AutoFormFieldProps } from '../core-types';
import { getRenderableText } from '../field-utils';
import {
  getControlLabel,
  getFlatOptions,
  getGroupedOptions,
  hasNumericOptions,
  normalizeScalarInput,
} from './field-values';
import { OptionLabel } from './shared';
import { useFieldTestIds } from './use-field-test-ids';

function RadioFieldComponent({ error, field, id, inputProps, label }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const numericOptions = hasNumericOptions(field);
  const value = normalizeScalarInput(inputProps.value);
  const optionGroups = getGroupedOptions(field);
  const flatOptions = getFlatOptions(field);

  return (
    <RadioGroup
      aria-invalid={Boolean(error)}
      aria-label={getControlLabel(label, field)}
      onValueChange={(nextValue: unknown) => {
        const scalar = normalizeScalarInput(nextValue);
        inputProps.onValueChange(numericOptions ? Number(scalar) : scalar);
      }}
      testId={testIds.control}
      value={value}
    >
      {(optionGroups !== undefined && optionGroups.length > 0
        ? optionGroups
        : [{ label: undefined, options: flatOptions }]
      ).map((group) => (
        <div
          className="space-y-2"
          data-testid={testIds.group(getRenderableText(group.label, 'options'))}
          key={JSON.stringify(group.options.map((option) => option.value))}
        >
          {hasSlotContent(group.label) ? <div className="text-body-sm text-subtle">{group.label}</div> : null}
          <div className="grid gap-2">
            {group.options.map((option) => (
              <label
                className="flex cursor-pointer items-center gap-3 rounded-md border border-border-subtle px-3 py-2 transition-colors hover:bg-accent motion-reduce:transition-none"
                htmlFor={`${field.key}-${option.value}`}
                key={option.value}
              >
                <RadioGroupItem
                  disabled={inputProps.disabled}
                  id={`${field.key}-${option.value}`}
                  testId={testIds.option(option.value)}
                  value={option.value}
                />
                <OptionLabel option={option} />
              </label>
            ))}
          </div>
        </div>
      ))}
    </RadioGroup>
  );
}

export { RadioFieldComponent };
