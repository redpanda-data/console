import { FormControl, FormHelperText, FormLabel, NumberInput, type NumberInputProps, Stack } from '@redpanda-data/ui';
import type { ReactNode } from 'react';

import { ErrorInfoField } from '../error-info/error-info-field';
import { useFieldContext } from '../form-hook-contexts';

interface NumberFieldProps extends NumberInputProps {
  label?: ReactNode;
  helperText?: ReactNode;
  placeholder?: string;
  isDisabled?: boolean;
}

export const NumberField = ({
  label,
  helperText,
  placeholder,
  transform,
  isDisabled,
  min,
  max,
  ...rest
}: NumberFieldProps) => {
  const field = useFieldContext<number>();

  return (
    <FormControl isInvalid={!!field.state.meta.errors?.length}>
      <Stack spacing={0.5}>
        {label && (
          <FormLabel fontWeight="medium" mb={0}>
            {label}
          </FormLabel>
        )}
        {helperText && (
          <FormHelperText mt={0} mb={1}>
            {helperText}
          </FormHelperText>
        )}
      </Stack>
      <NumberInput
        value={field.state.value}
        onChange={(_valueAsString, valueAsNumber) => {
          if (Number.isNaN(valueAsNumber)) {
            field.handleChange(min ?? 0);
          } else {
            field.handleChange(valueAsNumber);
          }
        }}
        placeholder={placeholder}
        isDisabled={isDisabled}
        min={min}
        max={max}
        {...rest}
      />
      <ErrorInfoField field={field} />
    </FormControl>
  );
};
//             <em>{field.state.meta.errors.map((err) => err.message).join(',')}</em>
