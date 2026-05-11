'use client';

import { DollarSignIcon } from 'lucide-react';

import { useFieldTestIds } from './shared';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '../../input-group';
import type { AutoFormFieldProps } from '../core-types';
import { CURRENCY_FIELD_PATTERN, getFieldUiConfig } from '../helpers';
import type { FieldTypeDefinition } from '../registry';

function CurrencyFieldComponent({ error, field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);

  return (
    <InputGroup testId={testIds.control}>
      <InputGroupAddon>
        <InputGroupText>
          <DollarSignIcon className="h-4 w-4" />
        </InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        aria-invalid={Boolean(error)}
        disabled={inputProps.disabled}
        id={id}
        inputMode="decimal"
        onBlur={inputProps.onBlur}
        onChange={(event) => inputProps.onValueChange(event.target.value)}
        placeholder={getFieldUiConfig(field).placeholder}
        testId={testIds.controlPart('input')}
        value={(inputProps.value as string | number | undefined)?.toString() ?? ''}
      />
    </InputGroup>
  );
}

export { CurrencyFieldComponent };

export const currencyFieldDefinition: FieldTypeDefinition = {
  name: 'currency',
  priority: 18,
  match: (field, context) => field.type === 'string' && CURRENCY_FIELD_PATTERN.test(context.identity),
  component: CurrencyFieldComponent,
};
