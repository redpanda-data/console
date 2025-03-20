import { Button, Flex, FormControl, FormErrorMessage, FormHelperText, FormLabel, Input } from '@redpanda-data/ui';
import { useFieldContext } from './form-hook-contexts';

export const KeyValueField = ({ label, helperText }: { label: string; helperText?: string }) => {
  const field = useFieldContext<Array<{ key: string; value: string }>>();

  // Add a new label
  const addLabel = () => {
    field.handleChange([...field.state.value, { key: '', value: '' }]);
  };

  return (
    <FormControl mb={4}>
      <FormLabel fontWeight="medium">{label}</FormLabel>
      {helperText && <FormHelperText mb={2}>{helperText}</FormHelperText>}

      {field.state.value.map((_, index) => (
        <KeyValuePairField key={index} index={index} />
      ))}

      <Button mt={2} size="sm" variant="outline" onClick={addLabel} leftIcon={<span>+</span>}>
        Add label
      </Button>
    </FormControl>
  );
};

// KeyValuePairField for individual key-value pairs
const KeyValuePairField = ({ index }: { index: number }) => {
  const parentField = useFieldContext<Array<{ key: string; value: string }>>();
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

  const isKeyError = currentLabel.value && !currentLabel.key;
  const isValueError = currentLabel.key && !currentLabel.value;

  return (
    <Flex gap={2} mb={2}>
      <FormControl isInvalid={!!isKeyError}>
        <Input placeholder="Key" value={currentLabel.key} onChange={(e) => handleKeyChange(e.target.value)} />
        {isKeyError && <FormErrorMessage>Label key is required</FormErrorMessage>}
      </FormControl>

      <FormControl isInvalid={!!isValueError}>
        <Input placeholder="Value" value={currentLabel.value} onChange={(e) => handleValueChange(e.target.value)} />
        {isValueError && <FormErrorMessage>Label value is required</FormErrorMessage>}
      </FormControl>
    </Flex>
  );
};
