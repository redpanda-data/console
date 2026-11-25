'use client';

import type React from 'react';
import { Input } from '../../input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '../../input-group';
import { hasSlotContent } from '../../../lib/has-slot-content';
import type { AutoFormFieldProps } from '../core-types';
import type { AutoFormOptionItem } from '../types';
import { normalizeScalarInput } from './field-values';

export function OptionLabel({ option }: { option: AutoFormOptionItem | { label?: React.ReactNode; value: string } }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {'icon' in option && hasSlotContent(option.icon) ? <span className="shrink-0">{option.icon}</span> : null}
      <span className="truncate">{option.label ?? option.value}</span>
    </span>
  );
}

export function StringLikeInput({
  error,
  icon,
  id,
  inputProps,
  placeholder,
  testId,
  type = 'text',
}: {
  error?: string | undefined;
  icon?: React.ReactNode | undefined;
  id: string;
  inputProps: AutoFormFieldProps['inputProps'];
  placeholder?: string | undefined;
  testId: string;
  type?: React.ComponentProps<typeof Input>['type'] | undefined;
}) {
  if (hasSlotContent(icon)) {
    return (
      <InputGroup testId={testId}>
        <InputGroupAddon>
          <InputGroupText>{icon}</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          aria-invalid={Boolean(error)}
          disabled={inputProps.disabled}
          id={id}
          onBlur={inputProps.onBlur}
          onChange={(event) => {
            inputProps.onValueChange(event.target.value);
          }}
          placeholder={placeholder}
          testId={`${testId}-input`}
          type={type}
          value={normalizeScalarInput(inputProps.value)}
        />
      </InputGroup>
    );
  }

  return (
    <Input
      aria-invalid={Boolean(error)}
      disabled={inputProps.disabled}
      id={id}
      onBlur={inputProps.onBlur}
      onChange={(event) => {
        inputProps.onValueChange(event.target.value);
      }}
      placeholder={placeholder}
      testId={testId}
      type={type}
      value={normalizeScalarInput(inputProps.value)}
    />
  );
}
