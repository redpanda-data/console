import {
  Button,
  ButtonGroup,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  VStack,
} from '@redpanda-data/ui';
import { useForm } from '@tanstack/react-form';
import { Scope, type Secret } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { CreateSecretRequest as CreateSecretRequestDataPlane } from 'protogen/redpanda/api/dataplane/v1alpha2/secret_pb';
import { useEffect } from 'react';
import { useCreateSecretMutation, useListSecretsQuery } from 'react-query/api/secret';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';

interface AddSecretModalProps {
  isOpen: boolean;
  onClose: () => void;
  secretType: SecretType;
  placeholderName: string;
  onSecretCreated?: (placeholderName: string, secretId: string) => void;
}

/**
 * Interface for secret selection state
 */
export interface SecretSelection {
  [key: string]: Secret | undefined;
}

/**
 * Secret types with their validation rules
 */
export type SecretType =
  | 'USERNAME'
  | 'PASSWORD'
  | 'POSTGRES_DSN'
  | 'OPENAI_API_KEY'
  | 'GCP_SERVICE_ACCOUNT'
  | 'REDPANDA_BROKERS'
  | 'GENERIC';

/**
 * Regular expression for validating secret names
 * Must start with uppercase letter and only contain uppercase letters, numbers, and underscores
 */
const SECRET_NAME_REGEX = /^[A-Z][A-Z0-9_]*$/;

/**
 * Check if a secret name contains special characters like colons that need to be normalized
 * @param name The secret name to check
 * @returns True if the name contains special characters that need normalization
 */
const hasSpecialCharacters = (name: string): boolean => {
  return /[^A-Z0-9_]/i.test(name);
};

/**
 * Log details about secret name normalization for debugging
 * @param originalName The original secret name
 * @param normalizedName The normalized secret name
 * @param reason The reason for normalization
 */
export const logSecretNormalization = (originalName: string, normalizedName: string, reason: string): void => {
  if (originalName !== normalizedName) {
    console.log(`Secret name normalized: "${originalName}" → "${normalizedName}"`, `Reason: ${reason}`);
  }
};

/**
 * Special handler for OpenAI model secrets with colons (e.g., "USER_CONFIGURED_OPENAI_MODEL:gpt-4o")
 * @param name The secret name to check and normalize if needed
 * @returns The normalized secret name with colons and other special characters replaced by underscores
 */
export const normalizeOpenAIModelSecret = (name: string): string => {
  if (!name) return 'SECRET'; // Handle empty or undefined names

  // Check if this looks like an OpenAI model secret with a colon
  const isOpenAIModelSecret = /USER_CONFIGURED_OPENAI_MODEL\b.*:/.test(name);

  if (isOpenAIModelSecret || hasSpecialCharacters(name)) {
    const normalized = name.replace(/[^A-Z0-9_]/gi, '_');
    const reason = isOpenAIModelSecret
      ? 'OpenAI model secret with colon detected'
      : 'Special characters replaced with underscores';

    logSecretNormalization(name, normalized, reason);
    return normalized;
  }

  return name;
};

/**
 * Normalize a secret name to match the required pattern
 * Replaces any special characters with underscores and makes sure it starts with an uppercase letter
 * @param name The original secret name to normalize
 * @returns The normalized secret name
 */
export const normalizeSecretName = (name: string): string => {
  if (!name || typeof name !== 'string') {
    return 'SECRET'; // Default value for empty, null, or undefined names
  }

  // Track original name for logging
  const originalName = name;

  // First, handle the specific case of OpenAI model secrets and other special characters
  let normalized = normalizeOpenAIModelSecret(name);

  // Make sure it's all uppercase
  if (normalized !== normalized.toUpperCase()) {
    const beforeUppercase = normalized;
    normalized = normalized.toUpperCase();
    logSecretNormalization(beforeUppercase, normalized, 'Converted to uppercase');
  }

  // Make sure it starts with a letter (if not, prepend with 'S')
  if (!/^[A-Z]/.test(normalized)) {
    const beforePrefix = normalized;
    normalized = `S${normalized}`;
    logSecretNormalization(beforePrefix, normalized, 'Added "S" prefix to start with a letter');
  }

  // Final check to ensure the name fully complies with the pattern
  if (!SECRET_NAME_REGEX.test(normalized)) {
    // This should never happen given our normalization steps, but as a fallback:
    const beforeFallback = normalized;
    // Replace any remaining invalid characters (defensive programming)
    normalized = normalized.replace(/[^A-Z0-9_]/g, '_');
    logSecretNormalization(beforeFallback, normalized, 'Emergency fallback normalization applied');
  }

  // Log final result if different from original
  if (originalName !== normalized) {
    console.log(`Final normalized secret name: "${originalName}" → "${normalized}"`);
  }

  return normalized;
};

/**
 * Placeholder text for different secret types
 */
const secretPlaceholders: Record<SecretType, string> = {
  USERNAME: 'Enter username (min 8 characters)',
  PASSWORD: 'Enter password (requires digit and special char)',
  POSTGRES_DSN: 'Enter Postgres DSN (e.g. postgres://user:pass@host:port/db)',
  OPENAI_API_KEY: 'Enter OpenAI API key (starts with sk-)',
  GCP_SERVICE_ACCOUNT: 'Enter GCP Service Account JSON',
  REDPANDA_BROKERS: 'Enter Redpanda brokers (e.g. localhost:9092,broker:9092)',
  GENERIC: 'Enter secret value',
};

/**
 * Helper text for different secret types
 */
const secretHelperText: Record<SecretType, string> = {
  USERNAME: 'Must be at least 8 characters long',
  PASSWORD: 'Must contain at least 1 digit and 1 special character',
  POSTGRES_DSN: 'Format: postgres://username:password@hostname:port/database',
  OPENAI_API_KEY: 'Must start with "sk-" and be at least 30 characters',
  GCP_SERVICE_ACCOUNT: 'Must be valid JSON with type, project_id, and private_key fields',
  REDPANDA_BROKERS: 'Format: host1:port1,host2:port2',
  GENERIC: 'No specific validation for this generic secret type',
};

/**
 * Determine the secret type based on the placeholder name
 * @param name The name of the placeholder
 * @returns The type of secret
 */
export const determineSecretType = (name: string): SecretType => {
  // Normalize the name by converting to uppercase for consistent comparison
  const normalizedName = name.toUpperCase();

  // Check for exact matches first
  if (normalizedName === 'USERNAME') return 'USERNAME';
  if (normalizedName === 'PASSWORD') return 'PASSWORD';
  if (normalizedName === 'OPENAI_API_KEY') return 'OPENAI_API_KEY';
  if (normalizedName === 'GCP_SERVICE_ACCOUNT') return 'GCP_SERVICE_ACCOUNT';
  if (normalizedName === 'REDPANDA_BROKERS') return 'REDPANDA_BROKERS';

  // Check for partial matches with PostgreSQL connection strings
  if (
    normalizedName === 'POSTGRES_DSN' ||
    normalizedName === 'POSTGRESQL_DSN' ||
    (normalizedName.includes('POSTGRES') &&
      (normalizedName.includes('DSN') || normalizedName.includes('CONNECTION') || normalizedName.includes('URL')))
  ) {
    return 'POSTGRES_DSN';
  }

  // Check for pattern-based matches
  if (normalizedName.includes('USER')) return 'USERNAME';
  if (normalizedName.includes('PASS') || normalizedName.includes('PWD')) return 'PASSWORD';
  if (normalizedName.includes('OPENAI') && normalizedName.includes('KEY')) return 'OPENAI_API_KEY';
  if (normalizedName.includes('GCP') || normalizedName.includes('SERVICE_ACCOUNT')) return 'GCP_SERVICE_ACCOUNT';
  if (normalizedName.includes('BROKER') || normalizedName.includes('KAFKA') || normalizedName.includes('REDPANDA')) {
    return 'REDPANDA_BROKERS';
  }

  // Default to generic if no specific type is matched
  return 'GENERIC';
};

export const AddSecretModal = ({
  isOpen,
  onClose,
  secretType,
  placeholderName,
  onSecretCreated,
}: AddSecretModalProps) => {
  const { data: secretList } = useListSecretsQuery();
  const { mutateAsync: createSecret } = useCreateSecretMutation();

  // Create the form with tanstack/react-form
  const form = useForm({
    defaultValues: {
      secretName: normalizeSecretName(placeholderName),
      secretValue: '',
    },
    onSubmit: async ({ value }) => {
      try {
        await createSecret({
          request: new CreateSecretRequestDataPlane({
            id: value.secretName,
            secretData: base64ToUInt8Array(encodeBase64(value.secretValue)),
            scopes: [Scope.REDPANDA_CONNECT],
          }),
        });

        console.log(`Secret '${value.secretName}' created successfully`);

        if (onSecretCreated) {
          onSecretCreated(placeholderName, value.secretName);
        }

        onClose();
      } catch (error) {
        console.error('Error creating secret:', error);
        // The form will handle validation errors, but we need to handle API errors
        return {
          error: `Failed to create secret: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    },
  });

  // Reset form when modal opens with new placeholder
  useEffect(() => {
    if (isOpen) {
      // Provide suggested name but don't force normalization
      // User can modify it as they wish
      form.reset({
        secretName: placeholderName,
        secretValue: '',
      });
    }
  }, [isOpen, placeholderName, form]);

  return (
    <Modal size="xl" isOpen={isOpen} onClose={onClose}>
      <ModalContent>
        <ModalHeader>Add Secret for {placeholderName}</ModalHeader>
        <ModalBody>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
          >
            <VStack spacing={4}>
              <form.Field
                name="secretName"
                validators={{
                  onChange: ({ value }) => {
                    // Check if name follows the pattern
                    if (!SECRET_NAME_REGEX.test(value)) {
                      return 'Secret name must start with an uppercase letter and only contain uppercase letters, numbers, and underscores';
                    }

                    // Check if name already exists
                    if (secretList?.secrets?.some((secret) => secret?.id?.toUpperCase() === value.toUpperCase())) {
                      return `Secret with name '${value}' already exists. Please use a different name.`;
                    }

                    return undefined;
                  },
                }}
              >
                {(field) => (
                  <FormControl isInvalid={!!field.state.meta.errors?.length}>
                    <FormLabel fontSize="14px" fontWeight={500}>
                      Secret Name
                    </FormLabel>
                    <Input
                      placeholder="Enter secret name (UPPERCASE_WITH_UNDERSCORES)"
                      value={field.state.value}
                      onChange={(e) => {
                        // Allow user to type any value without automatic normalization
                        field.handleChange(e.target.value);
                      }}
                    />
                    {field.state.meta.errors?.length ? (
                      <FormErrorMessage>{String(field.state.meta.errors[0])}</FormErrorMessage>
                    ) : (
                      <FormHelperText>
                        Secret name must start with an uppercase letter and only contain uppercase letters, numbers, and
                        underscores
                      </FormHelperText>
                    )}
                  </FormControl>
                )}
              </form.Field>

              <form.Field
                name="secretValue"
                validators={{
                  onChange: ({ value }) => {
                    switch (secretType) {
                      case 'USERNAME': {
                        if (value.length < 8) {
                          return 'Username must be at least 8 characters';
                        }
                        break;
                      }

                      case 'PASSWORD': {
                        const hasDigit = /\d/.test(value);
                        const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value);
                        if (!hasDigit || !hasSpecial) {
                          return 'Password must contain at least 1 digit and 1 special character';
                        }
                        break;
                      }

                      case 'POSTGRES_DSN': {
                        if (!/^postgres(?:ql)?:\/\/[^:]+:[^@]+@[^:]+:\d+\/[^?]+(?:\?.*)?$/.test(value)) {
                          return 'PostgreSQL DSN must be in format: postgres://username:password@hostname:port/database';
                        }
                        break;
                      }

                      case 'OPENAI_API_KEY': {
                        if (!value.startsWith('sk-') || value.length < 30) {
                          return 'OpenAI API key must start with "sk-" and be at least 30 characters long';
                        }
                        break;
                      }

                      case 'GCP_SERVICE_ACCOUNT': {
                        try {
                          const parsed = JSON.parse(value);
                          if (
                            typeof parsed !== 'object' ||
                            parsed === null ||
                            !('type' in parsed) ||
                            !('project_id' in parsed) ||
                            !('private_key' in parsed)
                          ) {
                            return 'GCP Service Account must be a valid JSON containing type, project_id, and private_key';
                          }
                        } catch {
                          return 'Invalid JSON format';
                        }
                        break;
                      }

                      case 'REDPANDA_BROKERS': {
                        if (!/^(?:[a-zA-Z0-9.-]+:\d+)(?:,[a-zA-Z0-9.-]+:\d+)*$/.test(value)) {
                          return 'Redpanda brokers must be in format: host1:port1,host2:port2';
                        }
                        break;
                      }
                    }

                    return undefined;
                  },
                }}
              >
                {(field) => (
                  <FormControl isInvalid={!!field.state.meta.errors?.length}>
                    <FormLabel fontSize="14px" fontWeight={500}>
                      Secret Value
                    </FormLabel>
                    <Input
                      placeholder={secretPlaceholders[secretType]}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    {field.state.meta.errors?.length ? (
                      <FormErrorMessage>{String(field.state.meta.errors[0])}</FormErrorMessage>
                    ) : (
                      <FormHelperText>{secretHelperText[secretType]}</FormHelperText>
                    )}
                  </FormControl>
                )}
              </form.Field>
            </VStack>

            <ModalFooter>
              <ButtonGroup>
                <form.Subscribe>
                  {({ canSubmit, isSubmitting }) => (
                    <Button
                      type="submit"
                      isLoading={isSubmitting}
                      loadingText="Creating"
                      isDisabled={!canSubmit}
                      variant="brand"
                    >
                      Create
                    </Button>
                  )}
                </form.Subscribe>
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
              </ButtonGroup>
            </ModalFooter>
          </form>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};
