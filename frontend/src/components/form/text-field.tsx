import { FormControl, FormErrorMessage, FormHelperText, FormLabel, Input } from '@redpanda-data/ui';
import { useFieldContext } from './form-hook-contexts';

export const TextField = ({
  label,
  helperText,
  placeholder,
  transform,
}: {
  label: string;
  helperText?: string;
  placeholder?: string;
  transform?: (value: string) => string;
}) => {
  const field = useFieldContext<string>();

  return (
    <FormControl isInvalid={!!field.state.meta.errors?.length}>
      <FormLabel fontWeight="medium">{label}</FormLabel>
      {helperText && <FormHelperText mb={2}>{helperText}</FormHelperText>}
      <Input
        value={field.state.value}
        onChange={(e) => field.handleChange(transform ? transform(e.target.value) : e.target.value)}
        onBlur={field.handleBlur}
        placeholder={placeholder}
      />
      {field.state.meta.errors?.length > 0 && <FormErrorMessage>{field.state.meta.errors[0]}</FormErrorMessage>}
    </FormControl>
  );
};
