import { create } from '@bufbuild/protobuf';
import {
  Button,
  createStandaloneToast,
  Flex,
  FormField,
  isSingleValue,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  PasswordInput,
  Select,
  Text,
  useDisclosure,
} from '@redpanda-data/ui';
import { useState } from 'react';

import {
  CreateSecretRequestSchema,
  Scope,
  type Secret,
} from '../../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import { rpcnSecretManagerApi } from '../../../../state/backend-api';
import { base64ToUInt8Array, encodeBase64 } from '../../../../utils/utils';
import { formatPipelineError } from '../errors';

const { toast } = createStandaloneToast();

// Regex for validating secret ID format
const SECRET_NAME_REGEX = /^[A-Za-z][A-Za-z0-9_]*$/;

type SecretsQuickAddProps = {
  isOpen: boolean;
  onCloseAddSecret: () => void;
  onAdd: (secretId: string) => void;
};

const SecretsQuickAdd = ({ isOpen, onAdd, onCloseAddSecret }: SecretsQuickAddProps) => {
  const [searchValue, setSearchValue] = useState('');
  const [secret, setSecret] = useState('');
  const [id, setId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const { isOpen: isNewSecret, onClose: disableNewSecret, onOpen: enableNewSecret } = useDisclosure();

  const availableSecrets =
    rpcnSecretManagerApi.secrets?.map((s) => ({
      label: s.id,
      value: s,
    })) ?? [];

  const addSecret = async (secretId: string) => {
    const normalizedId = secretId.toUpperCase();
    if (isNewSecret) {
      setIsCreating(true);
      const result = await rpcnSecretManagerApi
        .create(
          create(CreateSecretRequestSchema, {
            id: normalizedId,
            secretData: base64ToUInt8Array(encodeBase64(secret)),
            scopes: [Scope.REDPANDA_CONNECT],
          })
        )
        .then(async () => {
          toast({
            status: 'success',
            duration: 4000,
            isClosable: false,
            title: 'Secret created',
          });
          await rpcnSecretManagerApi.refreshSecrets(true);
          return true;
        })
        .catch((err) => {
          toast({
            status: 'error',
            duration: null,
            isClosable: true,
            title: 'Failed to create secret',
            description: formatPipelineError(err),
          });
          return false;
        });

      if (!result) {
        return;
      }
      setIsCreating(false);
      onAdd(`secrets.${id}`);
      closeModal();
      return;
    }
    // biome-ignore lint/suspicious/noUselessEscapeInString: we need to keep it as-is
    onAdd(`\$\{secrets.${id}}`);
  };

  const closeModal = () => {
    disableNewSecret();
    setSearchValue('');
    setSecret('');
    setId('');
    setIsCreating(false);
    onCloseAddSecret();
  };

  const isNameValid = (secretName: string) => {
    if (secretName === '') {
      return '';
    }
    if (!SECRET_NAME_REGEX.test(secretName)) {
      return 'The name you entered is invalid. It must start with an letter (A–Z) and can only contain alphanumeric and underscores (_).';
    }
    if (secretName.length > 255) {
      return 'The secret name must be fewer than 255 characters.';
    }
    return '';
  };

  return (
    <Modal isCentered={true} isOpen={isOpen} onClose={closeModal} size={'md'}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Select or add secret</ModalHeader>
        <ModalBody>
          <Flex flexDirection="column" gap={5} w={300}>
            <Text>Select an existing secret or create a new one. Secrets are available across all pipelines.</Text>
            <FormField
              description={
                isNewSecret
                  ? 'Creating new secret (stored in upper case)'
                  : 'Select existing or type new name to create'
              }
              errorText={isNameValid(id)}
              isInvalid={!!isNameValid(id)}
              label="Secret name"
            >
              <Select<Secret>
                creatable={true}
                inputValue={searchValue}
                isMulti={false}
                onChange={(val, meta) => {
                  if (val && isSingleValue(val) && val.value) {
                    if (meta.action === 'create-option') {
                      enableNewSecret();
                      // @ts-expect-error when creating a new secret, the value is a string
                      setId(meta.option.value);
                      return;
                    }
                    disableNewSecret();
                    setSecret('');
                    setSearchValue('');
                    setId(val.value.id);
                  }
                }}
                onInputChange={setSearchValue}
                options={availableSecrets}
                placeholder="Select or create secret"
              />
            </FormField>
            {isNewSecret && (
              <FormField label="Secret value">
                <Flex alignItems="center">
                  <PasswordInput
                    data-testid="secretValue"
                    isDisabled={false}
                    isRequired
                    onChange={(x) => setSecret(x.target.value)}
                    placeholder="Enter a secret value..."
                    type="password"
                    value={secret}
                  />
                </Flex>
              </FormField>
            )}
          </Flex>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button isDisabled={isCreating} onClick={() => closeModal()} variant={'outline'}>
            Cancel
          </Button>
          <Button
            isLoading={isCreating}
            onClick={() => {
              addSecret(id).catch(() => {
                // Error handling managed by API layer
              });
            }}
          >
            Select
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export { SecretsQuickAdd };
