import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import {
  Button,
  ButtonGroup,
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
  Stack,
  Text,
  useBoolean,
} from '@redpanda-data/ui';
import { CreateSecretRequest, Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useEffect, useState } from 'react';
import { useCreateSecretMutationWithToast, useListSecretsQuery } from 'react-query/api/secret';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';
import type { SecretFormData } from './secrets-store-page';

export const CreateSecretModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  // State for form data
  const [formData, setFormData] = useState<SecretFormData>({
    id: '',
    value: '',
    labels: [{ key: '', value: '' }],
  });
  const [showValue, setShowValue] = useBoolean(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const { data: secretList } = useListSecretsQuery();

  // Secret creation mutation
  const { mutateAsync: createSecret, isPending: isPendingCreateSecret } = useCreateSecretMutationWithToast();

  // Reset form on modal open/close
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        id: '',
        value: '',
        labels: [{ key: '', value: '' }],
      });
      setErrors({});
    }
  }, [isOpen]);

  // Validate form data
  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    // Validate ID - must be uppercase letters, numbers, and underscores only, starting with a letter
    if (!formData.id) {
      newErrors.id = 'ID is required';
    } else if (!/^[A-Z][A-Z0-9_]*$/.test(formData.id)) {
      newErrors.id = 'ID must use uppercase letters, numbers, and underscores only, starting with a letter';
    } else if (secretList?.secrets?.some((secret) => secret?.id === formData.id)) {
      newErrors.id = 'ID is already in use';
    }

    // Validate value
    if (!formData.value) {
      newErrors.value = 'Value is required';
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

    // Convert labels to map format
    const labelsMap: { [key: string]: string } = {};
    for (const label of formData.labels) {
      if (label.key && label.value) {
        labelsMap[label.key] = label.value;
      }
    }

    const request = new CreateSecretRequest({
      id: formData.id,
      // @ts-ignore js-base64 does not play nice with TypeScript 5: Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'Uint8Array<ArrayBuffer>'.
      secretData: base64ToUInt8Array(encodeBase64(formData.value)),
      scopes: [Scope.REDPANDA_CONNECT],
      labels: labelsMap,
    });

    await createSecret({ request });
    onClose();
  };

  // Handle input changes
  const handleInputChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
  };

  // Handle label changes
  const handleLabelChange = (index: number, field: 'key' | 'value', value: string) => {
    const updatedLabels = [...formData.labels];
    updatedLabels[index] = { ...updatedLabels[index], [field]: value };
    setFormData({ ...formData, labels: updatedLabels });
  };

  // Add a new label
  const addLabel = () => {
    setFormData({
      ...formData,
      labels: [...formData.labels, { key: '', value: '' }],
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Create new Secret</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={2}>
            <Text>Secrets are stored securely and cannot be read by Console after creation.</Text>

            <FormControl isInvalid={!!errors.id}>
              <FormLabel fontWeight="medium">ID</FormLabel>
              <FormHelperText mb={2}>ID must use uppercase letters, numbers, and underscores only.</FormHelperText>
              <Input
                value={formData.id}
                onChange={(e) => handleInputChange('id', e.target.value.toUpperCase())} // Always uppercase
                placeholder="SECRET_ID"
              />
              {errors.id && <FormErrorMessage>{errors.id}</FormErrorMessage>}
            </FormControl>

            <FormControl isInvalid={!!errors.value}>
              <FormLabel fontWeight="medium">Value</FormLabel>
              <InputGroup>
                <Input
                  type={showValue ? 'text' : 'password'}
                  value={formData.value}
                  onChange={(e) => handleInputChange('value', e.target.value)}
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
            <FormControl mb={4}>
              <FormLabel fontWeight="medium">Labels</FormLabel>
              <FormHelperText mb={2}>Labels can help you to organize your secrets.</FormHelperText>
              {formData.labels.map((label, index) => (
                <Flex key={index} gap={2} mb={2}>
                  <FormControl isInvalid={!!errors[`label-${index}-key`]}>
                    <Input
                      placeholder="Key"
                      value={label.key}
                      onChange={(e) => handleLabelChange(index, 'key', e.target.value)}
                    />
                    {errors[`label-${index}-key`] && (
                      <FormErrorMessage>{errors[`label-${index}-key`]}</FormErrorMessage>
                    )}
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
            </FormControl>
          </Stack>
        </ModalBody>

        <ModalFooter>
          <ButtonGroup isDisabled={isPendingCreateSecret}>
            <Button variant="brand" onClick={handleSubmit} isLoading={isPendingCreateSecret} loadingText="Creating">
              Create
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </ButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
