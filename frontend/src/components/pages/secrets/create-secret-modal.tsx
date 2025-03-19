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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!validateForm()) return;

    const request = new CreateSecretRequest({
      id: formData.id,
      // @ts-ignore js-base64 does not play nice with TypeScript 5: Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'Uint8Array<ArrayBuffer>'.
      secretData: base64ToUInt8Array(encodeBase64(formData.value)),
      scopes: [Scope.REDPANDA_CONNECT],
    });

    await createSecret({ request });
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
        <ModalHeader>Create new Secret</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing={4}>
            <Text>Secrets are stored securely and cannot be read by Console after creation.</Text>

            <FormControl isInvalid={!!errors.id}>
              <FormLabel fontWeight="medium">ID</FormLabel>
              <Input
                value={formData.id}
                onChange={(e) => handleInputChange('id', e.target.value.toUpperCase())} // Always uppercase
                placeholder="POSTGRES_CONNECTION_URL"
              />
              <FormHelperText>ID must use uppercase letters, numbers, and underscores only.</FormHelperText>
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
