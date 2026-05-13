'use client';

import {
  getControlLabel,
  getFlatOptions,
  getGroupedOptions,
  hasNumericOptions,
  renderOptionLabel,
  useFieldTestIds,
} from './shared';
import { RadioGroup, RadioGroupItem } from '../../radio-group';
import { Text } from '../../typography';
import type { AutoFormFieldProps } from '../core-types';
import type { FieldTypeDefinition } from '../registry';

function RadioFieldComponent({ error, field, id, inputProps, label }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);
  const numericOptions = hasNumericOptions(field);
  const value = inputProps.value === undefined || inputProps.value === null ? '' : String(inputProps.value);
  const optionGroups = getGroupedOptions(field);
  const flatOptions = getFlatOptions(field);

  return (
    <RadioGroup
      aria-invalid={Boolean(error)}
      aria-label={getControlLabel(label, field)}
      onValueChange={(nextValue) => inputProps.onValueChange(numericOptions ? Number(nextValue) : nextValue)}
      testId={testIds.control}
      value={value}
    >
      {(optionGroups?.length ? optionGroups : [{ label: undefined, options: flatOptions }]).map((group, groupIndex) => (
        <div
          className="space-y-2"
          data-testid={testIds.group(String(group.label ?? groupIndex))}
          key={`${field.key}-group-${groupIndex}`}
        >
          {group.label ? (
            <Text as="div" className="text-muted-foreground" variant="small">
              {group.label}
            </Text>
          ) : null}
          <div className="grid gap-2">
            {group.options.map((option) => (
              <label
                className="flex cursor-pointer items-center gap-3 rounded-md border border-border/70 px-3 py-2"
                htmlFor={`${field.key}-${option.value}`}
                key={option.value}
              >
                <RadioGroupItem
                  disabled={inputProps.disabled}
                  id={`${field.key}-${option.value}`}
                  testId={testIds.option(option.value)}
                  value={option.value}
                />
                {renderOptionLabel(option)}
              </label>
            ))}
          </div>
        </div>
      ))}
    </RadioGroup>
  );
}

export { RadioFieldComponent };

export const radioFieldDefinition: FieldTypeDefinition = {
  name: 'radio',
  priority: 15,
  match: (field) => {
    if (field.type !== 'select') {
      return false;
    }
    const optionCount = field.options?.length ?? 0;
    return optionCount > 0 && optionCount <= 3;
  },
  component: RadioFieldComponent,
};
