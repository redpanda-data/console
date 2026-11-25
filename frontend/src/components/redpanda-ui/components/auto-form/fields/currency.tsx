'use client';

import { DollarSignIcon } from 'lucide-react';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '../../input-group';
import type { AutoFormFieldProps } from '../core-types';
import { getFieldUiConfig } from '../ui-config';
import { normalizeScalarInput } from './field-values';
import { useFieldTestIds } from './use-field-test-ids';

function CurrencyFieldComponent({ error, field, id, inputProps }: AutoFormFieldProps) {
  const testIds = useFieldTestIds(id);

  return (
    <InputGroup testId={testIds.control}>
      <InputGroupAddon>
        <InputGroupText>
          <DollarSignIcon className="size-4" />
        </InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        aria-invalid={Boolean(error)}
        disabled={inputProps.disabled}
        id={id}
        inputMode="decimal"
        onBlur={inputProps.onBlur}
        onChange={(event) => {
          inputProps.onValueChange(event.target.value);
        }}
        placeholder={getFieldUiConfig(field).placeholder}
        testId={testIds.controlPart('input')}
        value={normalizeScalarInput(inputProps.value)}
      />
    </InputGroup>
  );
}

export { CurrencyFieldComponent };
