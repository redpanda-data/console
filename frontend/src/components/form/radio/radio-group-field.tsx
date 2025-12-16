import { FormControl, FormHelperText, FormLabel, Stack, type StackDirection } from '@redpanda-data/ui';
import { type ReactNode, useId } from 'react';

import { RadioCard, type Sizes } from './radio-card';
import { ErrorInfoField } from '../error-info/error-info-field';
import { useFieldContext } from '../form-hook-contexts';

type RadioGroupOption = {
  value: string;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
};

export type RadioGroupFieldProps = {
  label?: ReactNode;
  helperText?: ReactNode;
  options: RadioGroupOption[];
  direction?: StackDirection;
  size?: Sizes;
};

export const RadioGroupField = ({
  label,
  helperText,
  options,
  size = 'md',
  direction = 'row',
  ...rest
}: RadioGroupFieldProps) => {
  const field = useFieldContext<string>();
  const id = useId();

  return (
    <FormControl isInvalid={!!field.state.meta.errors?.length}>
      <Stack spacing={0.5}>
        {label && (
          <FormLabel fontWeight="medium" mb={0}>
            {label}
          </FormLabel>
        )}
        {helperText && (
          <FormHelperText mb={1} mt={0}>
            {helperText}
          </FormHelperText>
        )}
      </Stack>
      <Stack
        alignItems={direction === 'column' ? 'flex-start' : undefined}
        direction={direction}
        spacing={2}
        width={direction === 'column' ? 'fit-content' : '100%'}
      >
        {options.map((option) => (
          <RadioCard
            id={`${id}-${option.value}`}
            isChecked={option.value === field.state.value}
            isDisabled={option.disabled}
            isInvalid={option.invalid}
            key={`${id}-${option.value}`}
            onChange={(e) => field.handleChange(e.target.value)}
            size={size}
            value={`${option.value}`}
            {...rest}
          >
            {option.label}
          </RadioCard>
        ))}
      </Stack>
      <ErrorInfoField field={field} />
    </FormControl>
  );
};
