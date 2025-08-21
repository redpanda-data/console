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
import { rpcnSecretManagerApi } from '../../../../state/backendApi';
import { base64ToUInt8Array, encodeBase64 } from '../../../../utils/utils';
import { formatPipelineError } from '../errors';

const { toast } = createStandaloneToast();

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

  const addSecret = async (id: string) => {
    id = id.toUpperCase();
    if (isNewSecret) {
      setIsCreating(true);
      const result = await rpcnSecretManagerApi
        .create(
          create(CreateSecretRequestSchema, {
            id: id,
            secretData: base64ToUInt8Array(encodeBase64(secret)),
            scopes: [Scope.REDPANDA_CONNECT],
          }),
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
      // biome-ignore lint/suspicious/noUselessEscapeInString: leave this alone
      onAdd(`$\{secrets.${id}}`);
      closeModal();
      return;
    }
    // biome-ignore lint/suspicious/noUselessEscapeInString: leave this alone
    onAdd(`$\{secrets.${id}}`);
  };

  const closeModal = () => {
    disableNewSecret();
    setSearchValue('');
    setSecret('');
    setId('');
    setIsCreating(false);
    onCloseAddSecret();
  };

  const isNameValid = (id: string) => {
    if (id === '') {
      return '';
    }
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(id)) {
      return 'The name you entered is invalid. It must start with an letter (A–Z) and can only contain alphanumeric and underscores (_).';
    }
    if (id.length > 255) {
      return 'The secret name must be fewer than 255 characters.';
    }
    return '';
  };

  return (
    <Modal isOpen={isOpen} onClose={closeModal} isCentered={true} size={'md'}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Select or add secret</ModalHeader>
        <ModalBody>
          <Flex flexDirection="column" gap={5} w={300}>
            <Text>Select an existing secret or create a new one. Secrets are available across all pipelines.</Text>
            <FormField
              label="Secret name"
              errorText={isNameValid(id)}
              isInvalid={!!isNameValid(id)}
              description={
                isNewSecret
                  ? 'Creating new secret (stored in upper case)'
                  : 'Select existing or type new name to create'
              }
            >
              <Select<Secret>
                placeholder="Select or create secret"
                inputValue={searchValue}
                onInputChange={setSearchValue}
                isMulti={false}
                options={availableSecrets}
                creatable={true}
                onChange={(val, meta) => {
                  if (val && isSingleValue(val) && val.value) {
                    if (meta.action === 'create-option') {
                      console.log({ value: val, meta });
                      enableNewSecret();
                      // @ts-expect-error when creating a new secret, the value is a string
                      setId(meta.option.value);
                      return;
                    }
                    disableNewSecret();
                    setSecret('');
                    console.log({ value: val, meta });
                    setSearchValue('');
                    setId(val.value.id);
                  }
                }}
              />
            </FormField>
            {isNewSecret && (
              <FormField label="Secret value">
                <Flex alignItems="center">
                  <PasswordInput
                    placeholder="Enter a secret value..."
                    data-testid="secretValue"
                    isRequired
                    value={secret}
                    onChange={(x) => setSecret(x.target.value)}
                    type="password"
                    isDisabled={false}
                  />
                </Flex>
              </FormField>
            )}
          </Flex>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant={'outline'} isDisabled={isCreating} onClick={() => closeModal()}>
            Cancel
          </Button>
          <Button
            isLoading={isCreating}
            onClick={() => {
              void addSecret(id);
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
