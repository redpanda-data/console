import { FormControl, FormHelperText, FormLabel, Stack, Textarea, type TextareaProps } from '@redpanda-data/ui';
import type { ReactNode } from 'react';

import { ErrorInfoField } from '../error-info/error-info-field';
import { useFieldContext } from '../form-hook-contexts';

export interface TextAreaFieldProps extends Omit<TextareaProps, 'transform'> {
  label?: ReactNode;
  helperText?: ReactNode;
  placeholder?: string;
  transform?: (value: string) => string;
  isDisabled?: boolean;
}

export const TextAreaField = ({
  label,
  helperText,
  placeholder,
  transform,
  isDisabled,
  ...rest
}: TextAreaFieldProps) => {
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
          <FormHelperText mb={1} mt={0}>
            {helperText}
          </FormHelperText>
        )}
      </Stack>
      <Textarea
        isDisabled={isDisabled}
        onChange={(e) => {
          field.handleChange(transform ? transform(e.target.value) : e.target.value);
        }}
        placeholder={placeholder}
        value={field.state.value}
        {...rest}
      />
      <ErrorInfoField field={field} />
    </FormControl>
  );
};
