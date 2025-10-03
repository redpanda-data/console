import {
  Box,
  Button,
  ButtonGroup,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Icon,
  Input,
  type InputProps,
  Stack,
} from '@redpanda-data/ui';
import type { ReactNode } from 'react';
import { AiOutlineDelete } from 'react-icons/ai';
import { ErrorInfoField } from '../error-info/error-info-field';
import { useFieldContext } from '../form-hook-contexts';

interface KeyValuePair {
  key: string;
  value: string;
}

export interface KeyValueFieldProps extends InputProps {
  label: ReactNode;
  helperText?: ReactNode;
  showAddButton?: boolean;
}

export const KeyValueField = ({ label, helperText, showAddButton = true, ...rest }: KeyValueFieldProps) => {
  const field = useFieldContext<Array<KeyValuePair>>();

  // Add a new label
  const addLabel = () => {
    field.handleChange([...field.state.value, { key: '', value: '' }]);
  };

  return (
    <FormControl mb={4}>
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
      {field?.state?.value?.map((_, index) => (
        <KeyValuePairField key={index} index={index} {...rest} />
      ))}

      {showAddButton && (
        <ButtonGroup>
          <Button
            mt={2}
            size="sm"
            variant="outline"
            onClick={addLabel}
            data-testid="add-label-button"
            leftIcon={<span>+</span>}
          >
            Add label
          </Button>
        </ButtonGroup>
      )}
    </FormControl>
  );
};

interface KeyValuePairFieldProps extends InputProps {
  index: number;
  'data-testid'?: string;
}

const KeyValuePairField = ({ index, ...rest }: KeyValuePairFieldProps) => {
  const parentField = useFieldContext<Array<KeyValuePair>>();
  const currentLabel = parentField.state.value[index];

  const handleKeyChange = (value: string) => {
    const updatedLabels = [...parentField.state.value];
    updatedLabels[index] = {
      ...updatedLabels[index],
      key: value,
    };
    parentField.handleChange(updatedLabels);
  };

  const handleValueChange = (value: string) => {
    const updatedLabels = [...parentField.state.value];
    updatedLabels[index] = {
      ...updatedLabels[index],
      value: value,
    };
    parentField.handleChange(updatedLabels);
  };

  const handleDelete = () => {
    const updatedLabels = [...parentField.state.value];
    updatedLabels.splice(index, 1);
    parentField.handleChange(updatedLabels);
  };

  const isKeyError = currentLabel.value && !currentLabel.key;
  const isValueError = currentLabel.key && !currentLabel.value;

  return (
    <Flex gap={2} mb={2}>
      <Box display="flex" width="100%" alignItems="flex-start">
        <FormControl isInvalid={!!isKeyError} flexBasis="50%">
          <Input
            placeholder="Key"
            value={currentLabel.key}
            onChange={(e) => handleKeyChange(e.target.value)}
            {...rest}
            data-testid={rest['data-testid'] ? `${rest['data-testid']}-key-${index}` : undefined}
          />
          <ErrorInfoField field={parentField} />
        </FormControl>
        <FormControl isInvalid={!!isValueError} flexBasis="50%" ml={2}>
          <Input
            placeholder="Value"
            value={currentLabel.value}
            onChange={(e) => handleValueChange(e.target.value)}
            {...rest}
            data-testid={rest['data-testid'] ? `${rest['data-testid']}-value-${index}` : undefined}
          />
          <ErrorInfoField field={parentField} />
        </FormControl>
        <Flex alignItems="center" ml={2} height="40px">
          <Icon
            as={AiOutlineDelete}
            onClick={handleDelete}
            cursor="pointer"
            aria-label="Delete key-value pair"
            data-testid={rest['data-testid'] ? `${rest['data-testid']}-delete-${index}` : undefined}
          />
        </Flex>
      </Box>
    </Flex>
  );
};
