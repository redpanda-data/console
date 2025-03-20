import { FormControl, FormHelperText, FormLabel, Input } from '@redpanda-data/ui';
import { ErrorInfoField } from './error-info-field';
import { useFieldContext } from './form-hook-contexts';

interface TextFieldProps {
  label: string;
  helperText?: string;
  placeholder?: string;
  transform?: (value: string) => string;
  isDisabled?: boolean;
}

export const TextField = ({ label, helperText, placeholder, transform, isDisabled }: TextFieldProps) => {
  const field = useFieldContext<string>();

  return (
    <FormControl isInvalid={!!field.state.meta.errors?.length}>
      <FormLabel fontWeight="medium">{label}</FormLabel>
      {helperText && <FormHelperText mb={2}>{helperText}</FormHelperText>}
      <Input
        value={field.state.value}
        onChange={(e) => {
          field.handleChange(transform ? transform(e.target.value) : e.target.value);
        }}
        placeholder={placeholder}
        isDisabled={isDisabled}
      />
      <ErrorInfoField field={field} />
    </FormControl>
  );
};
//             <em>{field.state.meta.errors.map((err) => err.message).join(',')}</em>
