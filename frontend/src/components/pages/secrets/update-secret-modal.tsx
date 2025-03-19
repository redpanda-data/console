import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import {
  Button,
  ButtonGroup,
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
} from '@redpanda-data/ui';
import { useEffect, useState } from 'react';
import { useListSecretsQuery, useUpdateSecretMutationWithToast } from 'react-query/api/secret';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';
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
  });
  const [showValue, setShowValue] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Secret update mutation
  const { mutateAsync: updateSecret, isPending: isUpdateSecretPending } = useUpdateSecretMutationWithToast();

  // Get existing secret details (for labels)
  const { data: secretsData } = useListSecretsQuery();
  const secret = secretsData?.secrets?.find((secret) => secret?.id === secretId);

  // Initialize form data with existing secret labels
  useEffect(() => {
    if (isOpen && secret) {
      setFormData({
        id: secretId,
        value: '',
      });

      setErrors({});
    }
  }, [isOpen, secretId, secret]);

  // Validate form data
  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    // Validate secret value - now always required
    if (!formData.value || formData.value.trim() === '') {
      newErrors.value = 'Value is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!validateForm()) return;

    // Create request object
    const request = new UpdateSecretRequest({
      id: formData.id,
      scopes: [Scope.REDPANDA_CONNECT],
      // @ts-ignore js-base64 does not play nice with TypeScript 5: Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'Uint8Array<ArrayBuffer>'.
      secretData: formData.value ? base64ToUInt8Array(encodeBase64(formData.value)) : undefined,
    });

    // Submit the request
    await updateSecret({ request });

    // Close modal on success
    onClose();
  };

  // Handle input changes
  const handleInputChange = (field: string, value: string) => {
    setFormData({ ...formData, [field]: value });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Update Secret</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={4}>
            <Text>Secrets are stored securely and cannot be read by Console after creation.</Text>
            <FormControl>
              <FormLabel fontWeight="medium">ID</FormLabel>
              <Input value={formData.id} isDisabled />
            </FormControl>
            <FormControl isInvalid={!!errors.value} isRequired>
              <FormLabel fontWeight="medium">Value</FormLabel>
              <InputGroup>
                <Input
                  type={showValue ? 'text' : 'password'}
                  value={formData.value}
                  onChange={(e) => handleInputChange('value', e.target.value)}
                  placeholder="Enter new value"
                />
                <InputRightElement>
                  <Button variant="ghost" onClick={() => setShowValue(!showValue)}>
                    {showValue ? <ViewOffIcon /> : <ViewIcon />}
                  </Button>
                </InputRightElement>
              </InputGroup>
              {errors.value && <FormErrorMessage>{errors.value}</FormErrorMessage>}
            </FormControl>
          </Stack>
        </ModalBody>

        <ModalFooter>
          <ButtonGroup isDisabled={isUpdateSecretPending}>
            <Button variant="brand" onClick={handleSubmit} isLoading={isUpdateSecretPending} loadingText="Updating">
              Update
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
