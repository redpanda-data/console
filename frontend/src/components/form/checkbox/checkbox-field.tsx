import { Checkbox, type CheckboxProps, FormControl, FormLabel, HStack } from '@redpanda-data/ui';
import { ErrorInfoField } from '../error-info/error-info-field';
import { useFieldContext } from '../form-hook-contexts';

interface CheckboxFieldProps extends CheckboxProps {
  label?: string;
}

export const CheckboxField = ({ label, ...rest }: CheckboxFieldProps) => {
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
      </HStack>
      <ErrorInfoField field={field} />
    </FormControl>
  );
};
