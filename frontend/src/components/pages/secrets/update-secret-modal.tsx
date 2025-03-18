import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Input,
  InputGroup,
  InputRightElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  useBoolean,
} from '@redpanda-data/ui';
import { CreatableSelect } from 'chakra-react-select';
import { useEffect, useState } from 'react';
import { useListSecretsQuery, useUpdateSecretMutationWithToast } from 'react-query/api/secret';
import { Scope, UpdateSecretRequest } from '../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import type { SecretFormData } from './secrets-store-page';

export const UpdateSecretModal = ({
  isOpen,
  onClose,
  secretId,
}: { isOpen: boolean; onClose: () => void; secretId: string }) => {
  // State for form data
  const [formData, setFormData] = useState<SecretFormData>({
    id: secretId,
    value: '',
    labels: [{ key: '', value: '' }],
  });
  const [showValue, setShowValue] = useBoolean(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // New select state management
  const [selectedLabels, setSelectedLabels] = useState<Array<{ value: string; label: string }>>([]);
  const [labelOptions, setLabelOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [showAdvancedLabels, setShowAdvancedLabels] = useBoolean(false);

  // Secret update mutation
  const updateSecretMutation = useUpdateSecretMutationWithToast();

  // Get existing secret details (for labels)
  const { data: secretsData } = useListSecretsQuery();
  const secret = secretsData?.secrets?.find((secret) => secret?.id === secretId);

  // Initialize form data with existing secret labels
  useEffect(() => {
    if (isOpen && secret) {
      const existingLabels = secret.labels
        ? Object.entries(secret.labels).map(([key, value]) => ({ key, value }))
        : [{ key: '', value: '' }];

      setFormData({
        id: secretId,
        value: '',
        labels: existingLabels.length > 0 ? existingLabels : [{ key: '', value: '' }],
      });

      // Convert existing labels to select options
      const labelSelectOptions = existingLabels
        .filter((label) => label.key && label.value)
        .map((label) => ({
          value: `${label.key}:${label.value}`,
          label: `${label.key}: ${label.value}`,
        }));

      setSelectedLabels(labelSelectOptions);
      setLabelOptions(labelSelectOptions);

      setErrors({});
    }
  }, [isOpen, secretId, secret]);

  // Validate form data
  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    // Validate secret value - now always required
    if (!formData.value || formData.value.trim() === '') {
      newErrors.value = 'Secret value is required';
    }

    // Validate labels if any are filled
    for (const [index, label] of formData.labels.entries()) {
      if (label.key && !label.value) {
        newErrors[`label-${index}-value`] = 'Label value is required';
      }
      if (!label.key && label.value) {
        newErrors[`label-${index}-key`] = 'Label key is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      // Convert labels to map format
      const labelsMap: { [key: string]: string } = {};
      for (const label of formData.labels) {
        if (label.key && label.value) {
          labelsMap[label.key] = label.value;
        }
      }

      // Create request object
      const request = new UpdateSecretRequest({
        id: formData.id,
        labels: labelsMap,
        scopes: [Scope.REDPANDA_CONNECT],
      });

      // Only include secret data if a new value was provided
      if (formData.value) {
        request.secretData = new TextEncoder().encode(formData.value);
      }

      // Submit the request
      await updateSecretMutation.mutateAsync({ request });

      // Close modal on success
      onClose();
    } catch (error) {
      console.error('Failed to update secret:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle input changes
  const handleInputChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
  };

  // Handle label changes for key-value inputs
  const handleLabelChange = (index: number, field: 'key' | 'value', value: string) => {
    const updatedLabels = [...formData.labels];
    updatedLabels[index] = { ...updatedLabels[index], [field]: value };
    setFormData({ ...formData, labels: updatedLabels });

    // Update the selected labels for the CreatableSelect
    syncLabelsToSelect(updatedLabels);
  };

  // Add a new label field
  const addLabel = () => {
    setFormData({
      ...formData,
      labels: [...formData.labels, { key: '', value: '' }],
    });
  };

  // Sync labels from key-value inputs to select options
  const syncLabelsToSelect = (labels: Array<{ key: string; value: string }>) => {
    const validLabels = labels.filter((label) => label.key && label.value);
    const newSelectOptions = validLabels.map((label) => ({
      value: `${label.key}:${label.value}`,
      label: `${label.key}: ${label.value}`,
    }));

    setSelectedLabels(newSelectOptions);
    setLabelOptions(newSelectOptions);
  };

  // Handle selection change in multi-select
  const handleLabelsChange = (newValue: any) => {
    setSelectedLabels(newValue || []);

    // Update formData.labels based on selected options
    const newLabels = (newValue || []).map((item: { value: string }) => {
      const [key, value] = item.value.split(':');
      return { key, value };
    });

    setFormData({
      ...formData,
      labels: newLabels.length > 0 ? newLabels : [{ key: '', value: '' }],
    });
  };

  // Handle creation of new label options
  const handleCreateLabel = (inputValue: string) => {
    if (!inputValue.includes(':')) {
      // Show error or notification that format should be key:value
      return;
    }

    const [key, value] = inputValue.split(':');
    if (!key || !value) {
      // Show error that both key and value are required
      return;
    }

    const newOption = {
      value: inputValue,
      label: `${key}: ${value}`,
    };

    // Add to options
    setLabelOptions([...labelOptions, newOption]);

    // Add to selected values
    const newSelectedLabels = [...selectedLabels, newOption];
    setSelectedLabels(newSelectedLabels);

    // Update form data
    const newLabels = newSelectedLabels.map((item) => {
      const [k, v] = item.value.split(':');
      return { key: k, value: v };
    });

    setFormData({
      ...formData,
      labels: newLabels,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Update Secret</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text mb={12}>Secrets are stored securely and cannot be read by Console after creation.</Text>

          {/* Identifier Field - Disabled as it can't be changed */}
          <FormControl mb={4}>
            <FormLabel fontWeight="medium">Identifier</FormLabel>
            <FormHelperText mb={2}>ID must use uppercase letters, numbers, and underscores only.</FormHelperText>
            <Input value={formData.id} isDisabled placeholder="POSTGRES_CONNECTION_URL" />
          </FormControl>

          <FormControl mb={6} isInvalid={!!errors.value} isRequired>
            <FormLabel fontWeight="medium">Secret Value</FormLabel>
            <FormHelperText mb={2}>Labels can help you to organize your secrets.</FormHelperText>
            <InputGroup>
              <Input
                type={showValue ? 'text' : 'password'}
                value={formData.value}
                onChange={(e) => handleInputChange('value', e.target.value)}
                placeholder="Enter new value"
              />
              <InputRightElement>
                <Button variant="ghost" onClick={setShowValue.toggle}>
                  {showValue ? <ViewOffIcon /> : <ViewIcon />}
                </Button>
              </InputRightElement>
            </InputGroup>
            {errors.value && <FormErrorMessage>{errors.value}</FormErrorMessage>}
          </FormControl>

          {/* Labels Section */}
          <FormControl mb={4} isInvalid={!!errors.labels}>
            <Flex justifyContent="space-between" alignItems="center">
              <FormLabel fontWeight="medium" mb={0}>
                Labels
              </FormLabel>
            </Flex>

            {/* CreatableSelect for labels */}
            <Box mb={4}>
              <CreatableSelect
                isMulti
                placeholder="Type to add labels (format: key:value)"
                onChange={handleLabelsChange}
                onCreateOption={handleCreateLabel}
                formatCreateLabel={(inputValue) => `Add "${inputValue}"`}
                options={labelOptions}
                value={selectedLabels}
                components={{
                  DropdownIndicator: null,
                }}
                isClearable={false}
              />
            </Box>

            {formData.labels.map((label, index) => (
              <Flex key={index} gap={2} mb={2}>
                <FormControl isInvalid={!!errors[`label-${index}-key`]}>
                  <Input
                    placeholder="Key"
                    value={label.key}
                    onChange={(e) => handleLabelChange(index, 'key', e.target.value)}
                  />
                  {errors[`label-${index}-key`] && <FormErrorMessage>{errors[`label-${index}-key`]}</FormErrorMessage>}
                </FormControl>

                <FormControl isInvalid={!!errors[`label-${index}-value`]}>
                  <Input
                    placeholder="Value"
                    value={label.value}
                    onChange={(e) => handleLabelChange(index, 'value', e.target.value)}
                  />
                  {errors[`label-${index}-value`] && (
                    <FormErrorMessage>{errors[`label-${index}-value`]}</FormErrorMessage>
                  )}
                </FormControl>
              </Flex>
            ))}

            <Button mt={2} size="sm" variant="outline" onClick={addLabel} leftIcon={<span>+</span>}>
              Add label
            </Button>

            {errors.labels && <FormErrorMessage>{errors.labels}</FormErrorMessage>}
          </FormControl>
        </ModalBody>

        <ModalFooter>
          <Button variant="brand" onClick={handleSubmit} isLoading={isSubmitting} loadingText="Updating">
            Update Secret
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
