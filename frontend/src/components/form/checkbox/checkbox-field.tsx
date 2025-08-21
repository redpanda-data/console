import { Checkbox, type CheckboxProps, FormControl, FormHelperText, FormLabel, HStack } from '@redpanda-data/ui';
import type { ReactNode } from 'react';

import { ErrorInfoField } from '../error-info/error-info-field';
import { useFieldContext } from '../form-hook-contexts';

interface CheckboxFieldProps extends CheckboxProps {
  label?: ReactNode;
  helperText?: ReactNode;
}

export const CheckboxField = ({ label, helperText, ...rest }: CheckboxFieldProps) => {
  const field = useFieldContext<boolean>();

  return (
    <FormControl isInvalid={!!field.state.meta.errors?.length}>
      <HStack spacing={2} alignItems="center">
        <Checkbox isChecked={field.state.value} onChange={(e) => field.handleChange(e.target.checked)} {...rest} />
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
      </HStack>

      <ErrorInfoField field={field} />
    </FormControl>
  );
};
