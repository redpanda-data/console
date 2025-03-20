import { FormControl, FormHelperText, FormLabel, Input, type InputProps } from '@redpanda-data/ui';
import { ErrorInfoField } from './error-info-field';
import { useFieldContext } from './form-hook-contexts';

interface TextFieldProps extends Omit<InputProps, 'transform'> {
  label?: string;
  helperText?: string;
  placeholder?: string;
  transform?: (value: string) => string;
  isDisabled?: boolean;
}

export const TextField = ({ label, helperText, placeholder, transform, isDisabled, ...rest }: TextFieldProps) => {
  const field = useFieldContext<string>();

  return (
    <FormControl isInvalid={!!field.state.meta.errors?.length}>
      {label && <FormLabel fontWeight="medium">{label}</FormLabel>}
      {helperText && <FormHelperText mb={2}>{helperText}</FormHelperText>}
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
//             <em>{field.state.meta.errors.map((err) => err.message).join(',')}</em>
