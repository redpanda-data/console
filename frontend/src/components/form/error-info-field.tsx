import { FormErrorMessage, ListItem, Text, UnorderedList } from '@redpanda-data/ui';
import type { AnyFieldApi } from '@tanstack/react-form';

interface ErrorInfoFieldProps {
  field: AnyFieldApi;
  index?: string;
}

/**
 * This component needs to be used inside a FormControl component.
 * It will display all error messages in a list format for a given form field.
 * The form field needs the `isInvalid` prop set to true and it had to be touched by the user.
 * @see https://v2.chakra-ui.com/docs/components/form-control#error-message
 */
export const ErrorInfoField = ({ field, index }: ErrorInfoFieldProps) => {
  if (field.state.meta.errors?.length === 0) {
    return null;
  }

  return (
    <FormErrorMessage>
      <UnorderedList>
        {field.state.meta.errors.map((error) => (
          <ListItem key={index ?? error.message}>
            <Text>{error.message}</Text>
          </ListItem>
        ))}
      </UnorderedList>
    </FormErrorMessage>
  );
};
