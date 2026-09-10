import { create } from '@bufbuild/protobuf';
import { Button } from 'components/redpanda-ui/components/button';
import { Combobox } from 'components/redpanda-ui/components/combobox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { Text } from 'components/redpanda-ui/components/typography';
import { useState } from 'react';

import { CreateSecretRequestSchema, Scope } from '../../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import { rpcnSecretManagerApi } from '../../../../state/backend-api';
import { showToast } from '../../../../utils/toast.utils';
import { base64ToUInt8Array, encodeBase64 } from '../../../../utils/utils';
import { formatPipelineError } from '../errors';

// Regex for validating secret ID format
const SECRET_NAME_REGEX = /^[A-Za-z][A-Za-z0-9_]*$/;
const SECRET_NAME_MAX_LENGTH = 255;

type SecretsQuickAddProps = {
  isOpen: boolean;
  onCloseAddSecret: () => void;
  onAdd: (secretId: string) => void;
};

const SecretsQuickAdd = ({ isOpen, onAdd, onCloseAddSecret }: SecretsQuickAddProps) => {
  const [secret, setSecret] = useState('');
  const [id, setId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isNewSecret, setIsNewSecret] = useState(false);

  // Read on every render: `secrets` is a MobX observable that refreshes underneath us.
  // A pending new name is deliberately absent — an option matching the selection makes
  // re-clicking it a deselect, and suppresses the Combobox's own Create item.
  const availableSecrets = (rpcnSecretManagerApi.secrets ?? []).map((s) => ({
    label: s.id,
    value: s.id,
  }));

  const addSecret = async (secretId: string) => {
    const normalizedId = secretId.toUpperCase();
    if (isNewSecret) {
      setIsCreating(true);
      const result = await rpcnSecretManagerApi
        .create(
          create(CreateSecretRequestSchema, {
            id: normalizedId,
            secretData: base64ToUInt8Array(encodeBase64(secret)),
            scopes: [Scope.REDPANDA_CONNECT, Scope.MCP_SERVER],
          })
        )
        .then(async () => {
          showToast({
            status: 'success',
            duration: 4000,
            title: 'Secret created',
          });
          await rpcnSecretManagerApi.refreshSecrets(true);
          return true;
        })
        .catch((err) => {
          showToast({
            status: 'error',
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
    setIsNewSecret(false);
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
    if (secretName.length > SECRET_NAME_MAX_LENGTH) {
      return 'The secret name must be fewer than 255 characters.';
    }
    return '';
  };

  const nameError = isNameValid(id);
  const hasNameError = Boolean(nameError);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          closeModal();
        }
      }}
      open={isOpen}
    >
      <DialogContent size="md">
        {/* Room for DialogContent's close button. */}
        <DialogHeader className="pr-10">
          <DialogTitle>Select or add secret</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex w-[300px] flex-col gap-5">
            <Text>Select an existing secret or create a new one. Secrets are available across all pipelines.</Text>
            {/* The Combobox exposes no `id`, so this label cannot be wired with `htmlFor`. */}
            <Field data-invalid={hasNameError}>
              <FieldLabel>Secret name</FieldLabel>
              <Combobox
                creatable
                createLabel="secret"
                inputTestId="secret-name"
                onChange={(value) => {
                  // Combobox emits '' when it clears; mirror that into our own state.
                  setIsNewSecret(false);
                  setSecret('');
                  setId(value);
                }}
                onCreateOption={(value) => {
                  setIsNewSecret(true);
                  setId(value);
                }}
                options={availableSecrets}
                placeholder="Select or create secret"
                value={id}
              />
              <FieldDescription>
                {isNewSecret
                  ? 'Creating new secret (stored in upper case)'
                  : 'Select existing or type new name to create'}
              </FieldDescription>
              {hasNameError ? <FieldError errors={[{ message: nameError }]} /> : null}
            </Field>
            {Boolean(isNewSecret) && (
              <Field>
                <FieldLabel htmlFor="secretValue" required>
                  Secret value
                </FieldLabel>
                <Input
                  id="secretValue"
                  onChange={(x) => setSecret(x.target.value)}
                  placeholder="Enter a secret value..."
                  required
                  testId="secretValue"
                  type="password"
                  value={secret}
                />
              </Field>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button disabled={isCreating} onClick={() => closeModal()} variant="ghost">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export { SecretsQuickAdd };
