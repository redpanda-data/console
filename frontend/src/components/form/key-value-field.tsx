import { Button, Flex, FormControl, FormHelperText, FormLabel, Input } from '@redpanda-data/ui';
import { ErrorInfoField } from './error-info-field';
import { useFieldContext } from './form-hook-contexts';

interface KeyValuePair {
  key: string;
  value: string;
}

interface KeyValueFieldProps {
  label: string;
  helperText?: string;
}

export const KeyValueField = ({ label, helperText }: KeyValueFieldProps) => {
  const field = useFieldContext<Array<KeyValuePair>>();

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

interface KeyValuePairFieldProps {
  index: number;
}

const KeyValuePairField = ({ index }: KeyValuePairFieldProps) => {
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

  const isKeyError = currentLabel.value && !currentLabel.key;
  const isValueError = currentLabel.key && !currentLabel.value;

  return (
    <Flex gap={2} mb={2}>
      <FormControl isInvalid={!!isKeyError}>
        <Input placeholder="Key" value={currentLabel.key} onChange={(e) => handleKeyChange(e.target.value)} />
        <ErrorInfoField field={parentField} index={`${currentLabel.key}-key`} />
      </FormControl>
      <FormControl isInvalid={!!isValueError}>
        <Input placeholder="Value" value={currentLabel.value} onChange={(e) => handleValueChange(e.target.value)} />
        <ErrorInfoField field={parentField} index={`${currentLabel.value}-value`} />
      </FormControl>
    </Flex>
  );
};
