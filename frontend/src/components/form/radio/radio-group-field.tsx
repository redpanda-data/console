import { FormControl, FormLabel, Stack, type StackDirection } from '@redpanda-data/ui';
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
  label?: string;
  options: RadioGroupOption[];
  direction?: StackDirection;
  size?: Sizes;
}

export const RadioGroupField = ({ label, options, size = 'md', direction = 'row', ...rest }: RadioGroupFieldProps) => {
  const field = useFieldContext<string>();

  return (
    <FormControl isInvalid={!!field.state.meta.errors?.length}>
      {label && <FormLabel fontWeight="medium">{label}</FormLabel>}
      <Stack
        direction={direction}
        spacing={2}
        width={direction === 'column' ? 'fit-content' : '100%'}
        alignItems={direction === 'column' ? 'flex-start' : undefined}
      >
        {options.map((option) => (
          <RadioCard
            key={`${option.value}`}
            id={`${option.value}`}
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
