import { FormControl, FormHelperText, FormLabel, HStack, Icon, Stack, Text } from '@redpanda-data/ui';
import type { SelectOption } from '@redpanda-data/ui/dist/components/Inputs/Select/Select';
import type { ReactNode } from 'react';
import { AiOutlinePlus } from 'react-icons/ai';
import { SingleSelect } from '../../misc/Select';
import { ErrorInfoField } from '../error-info/error-info-field';
import { useFieldContext } from '../form-hook-contexts';

interface SingleSelectFieldProps {
  label?: ReactNode;
  helperText?: ReactNode;
  placeholder?: string;
  isDisabled?: boolean;
  options: SelectOption[];
  showCreateNewOption?: boolean;
  onCreateNewOptionClick?: () => void;
}

export const CREATE_NEW_OPTION_VALUE = 'CREATE_NEW_OPTION_VALUE';

const CREATE_NEW_OPTION = {
  value: CREATE_NEW_OPTION_VALUE,
  label: (
    <HStack spacing={1}>
      <Icon as={AiOutlinePlus} />
      <Text fontWeight="semibold">Create New</Text>
    </HStack>
  ),
};

export const SingleSelectField = ({
  label,
  helperText,
  placeholder,
  isDisabled,
  options,
  showCreateNewOption,
  onCreateNewOptionClick,
}: SingleSelectFieldProps) => {
  const field = useFieldContext<string>();

  const handleChange = (value: string | number | readonly string[] | undefined) => {
    if (value === CREATE_NEW_OPTION_VALUE) {
      if (showCreateNewOption) {
        onCreateNewOptionClick?.();
      }
    } else {
      field.handleChange(value?.toString() ?? '');
    }
  };

  const selectOptions = showCreateNewOption ? [...options, CREATE_NEW_OPTION] : options;

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
      <SingleSelect
        options={selectOptions}
        onChange={handleChange}
        placeholder={placeholder}
        isDisabled={isDisabled}
        value={field.state.value}
      />

      <ErrorInfoField field={field} />
    </FormControl>
  );
};
