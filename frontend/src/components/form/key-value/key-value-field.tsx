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

type KeyValuePair = {
  key: string;
  value: string;
};

export interface KeyValueFieldProps extends InputProps {
  label: ReactNode;
  helperText?: ReactNode;
  showAddButton?: boolean;
}

export const KeyValueField = ({ label, helperText, showAddButton = true, ...rest }: KeyValueFieldProps) => {
  const field = useFieldContext<KeyValuePair[]>();

  // Add a new label
  const addLabel = () => {
    field.handleChange([...field.state.value, { key: '', value: '' }]);
  };

  return (
    <FormControl mb={4}>
      <Stack spacing={0.5}>
        {Boolean(label) && (
          <FormLabel fontWeight="medium" mb={0}>
            {label}
          </FormLabel>
        )}
        {Boolean(helperText) && (
          <FormHelperText mb={1} mt={0}>
            {helperText}
          </FormHelperText>
        )}
      </Stack>
      {field?.state?.value?.map((_, index) => (
        <KeyValuePairField index={index} key={index} {...rest} />
      ))}

      {Boolean(showAddButton) && (
        <ButtonGroup>
          <Button
            data-testid="add-label-button"
            leftIcon={<span>+</span>}
            mt={2}
            onClick={addLabel}
            size="sm"
            variant="outline"
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
  const parentField = useFieldContext<KeyValuePair[]>();
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
      value,
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
      <Box alignItems="flex-start" display="flex" width="100%">
        <FormControl flexBasis="50%" isInvalid={!!isKeyError}>
          <Input
            onChange={(e) => handleKeyChange(e.target.value)}
            placeholder="Key"
            value={currentLabel.key}
            {...rest}
            data-testid={rest['data-testid'] ? `${rest['data-testid']}-key-${index}` : undefined}
          />
          <ErrorInfoField field={parentField} />
        </FormControl>
        <FormControl flexBasis="50%" isInvalid={!!isValueError} ml={2}>
          <Input
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder="Value"
            value={currentLabel.value}
            {...rest}
            data-testid={rest['data-testid'] ? `${rest['data-testid']}-value-${index}` : undefined}
          />
          <ErrorInfoField field={parentField} />
        </FormControl>
        <Flex alignItems="center" height="40px" ml={2}>
          <Icon
            aria-label="Delete key-value pair"
            as={AiOutlineDelete}
            cursor="pointer"
            data-testid={rest['data-testid'] ? `${rest['data-testid']}-delete-${index}` : undefined}
            onClick={handleDelete}
          />
        </Flex>
      </Box>
    </Flex>
  );
};
