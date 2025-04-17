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
 * If there are multiple errors, "required" errors will be filtered out.
 * @see https://v2.chakra-ui.com/docs/components/form-control#error-message
 */
export const ErrorInfoField = ({ field }: ErrorInfoFieldProps) => {
  if (field.state.meta.errors?.length === 0) {
    return null;
  }

  const errors = field.state.meta.errors;
  const isRequiredError = (error: { message: string }) => error.message.toLowerCase().includes('is required');

  // If there are multiple errors, filter out "is required" errors
  const filteredErrors = errors.length > 1 ? errors.filter((error) => !isRequiredError(error)) : errors;

  if (filteredErrors.length === 0) {
    return null;
  }

  return (
    <FormErrorMessage>
      <UnorderedList>
        {filteredErrors.map((error, index) => (
          <ListItem key={`${field.name}-${index}`}>
            <Text>{error.message}</Text>
          </ListItem>
        ))}
      </UnorderedList>
    </FormErrorMessage>
  );
};
