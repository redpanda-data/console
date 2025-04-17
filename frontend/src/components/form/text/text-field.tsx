import { FormControl, FormHelperText, FormLabel, Input, type InputProps, Stack } from '@redpanda-data/ui';
import type { ReactNode } from 'react';
import { ErrorInfoField } from '../error-info/error-info-field';
import { useFieldContext } from '../form-hook-contexts';

interface TextFieldProps extends Omit<InputProps, 'transform'> {
  label?: ReactNode;
  helperText?: ReactNode;
  placeholder?: string;
  transform?: (value: string) => string;
  isDisabled?: boolean;
}

export const TextField = ({ label, helperText, placeholder, transform, isDisabled, ...rest }: TextFieldProps) => {
  const field = useFieldContext<string>();

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
      <Input
        value={field.state.value}
        onChange={(e) => {
          field.handleChange(transform ? transform(e.target.value) : e.target.value);
        }}
        placeholder={placeholder}
        isDisabled={isDisabled}
        {...rest}
      />
      <ErrorInfoField field={field} />
    </FormControl>
  );
};
