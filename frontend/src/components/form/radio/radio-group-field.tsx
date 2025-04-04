import { FormControl, FormHelperText, FormLabel, Stack, type StackDirection } from '@redpanda-data/ui';
import { type ReactNode, useId } from 'react';
import { ErrorInfoField } from '../error-info/error-info-field';
import { useFieldContext } from '../form-hook-contexts';
import { RadioCard, type Sizes } from './radio-card';

interface RadioGroupOption {
  value: string;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
}

interface RadioGroupFieldProps {
  label?: ReactNode;
  helperText?: ReactNode;
  options: RadioGroupOption[];
  direction?: StackDirection;
  size?: Sizes;
}

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
          <FormHelperText mt={0} mb={1}>
            {helperText}
          </FormHelperText>
        )}
      </Stack>
      <Stack
        direction={direction}
        spacing={2}
        width={direction === 'column' ? 'fit-content' : '100%'}
        alignItems={direction === 'column' ? 'flex-start' : undefined}
      >
        {options.map((option) => (
          <RadioCard
            key={`${id}-${option.value}`}
            id={`${id}-${option.value}`}
            value={`${option.value}`}
            isInvalid={option.invalid}
            isDisabled={option.disabled}
            isChecked={option.value === field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            size={size}
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
