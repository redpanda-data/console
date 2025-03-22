import { FormControl, FormHelperText, FormLabel } from '@redpanda-data/ui';
import type { SelectOption } from '@redpanda-data/ui/dist/components/Inputs/Select/Select';
import type { ReactNode } from 'react';
import { SingleSelect } from '../../misc/Select';
import { ErrorInfoField } from '../error-info/error-info-field';
import { useFieldContext } from '../form-hook-contexts';

interface SingleSelectFieldProps {
  label?: ReactNode;
  helperText?: ReactNode;
  placeholder?: string;
  isDisabled?: boolean;
  options: SelectOption[];
}

export const SingleSelectField = ({ label, helperText, placeholder, isDisabled, options }: SingleSelectFieldProps) => {
  const field = useFieldContext<string>();

  return (
    <FormControl isInvalid={!!field.state.meta.errors?.length}>
      {label && <FormLabel fontWeight="medium">{label}</FormLabel>}
      {helperText && <FormHelperText mb={1}>{helperText}</FormHelperText>}
      <SingleSelect
        options={options}
        value={field.state.value}
        onChange={(value) => {
          field.handleChange(value?.toString() ?? '');
        }}
        placeholder={placeholder}
        isDisabled={isDisabled}
      />

      <ErrorInfoField field={field} />
    </FormControl>
  );
};
//             <em>{field.state.meta.errors.map((err) => err.message).join(',')}</em>
