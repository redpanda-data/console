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
  Text,
  VStack,
} from '@redpanda-data/ui';
import { Scope, type Secret } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { CreateSecretRequest as CreateSecretRequestDataPlane } from 'protogen/redpanda/api/dataplane/v1alpha2/secret_pb';
import { useEffect, useState } from 'react';
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
 * Interface for secret validation rules
 */
interface SecretValidationRule {
  validate: (value: string) => boolean;
  errorMessage: string;
  placeholder: string;
}

/**
 * Validation rules for different types of secrets
 */
const secretValidationRules: Record<SecretType, SecretValidationRule> = {
  USERNAME: {
    validate: (value: string) => value.length >= 8,
    errorMessage: 'Username must be at least 8 characters',
    placeholder: 'Enter username (min 8 characters)',
  },
  PASSWORD: {
    validate: (value: string) => {
      const hasDigit = /\d/.test(value);
      const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value);
      return hasDigit && hasSpecial;
    },
    errorMessage: 'Password must contain at least 1 digit and 1 special character',
    placeholder: 'Enter password (requires digit and special char)',
  },
  POSTGRES_DSN: {
    validate: (value: string) => {
      // Enhanced validation for PostgreSQL connection strings
      // Format: postgres://username:password@hostname:port/database
      // or postgresql://username:password@hostname:port/database[?parameters]
      const regex = /^postgres(?:ql)?:\/\/[^:]+:[^@]+@[^:]+:\d+\/[^?]+(?:\?.*)?$/;
      return regex.test(value);
    },
    errorMessage: 'PostgreSQL DSN must be in format: postgres://username:password@hostname:port/database',
    placeholder: 'Enter Postgres DSN (e.g. postgres://user:pass@host:port/db)',
  },
  OPENAI_API_KEY: {
    validate: (value: string) => {
      // OpenAI API keys typically start with 'sk-' and have a specific length
      return value.startsWith('sk-') && value.length >= 30;
    },
    errorMessage: 'OpenAI API key must start with "sk-" and be at least 30 characters long',
    placeholder: 'Enter OpenAI API key (starts with sk-)',
  },
  GCP_SERVICE_ACCOUNT: {
    validate: (value: string) => {
      // GCP service account credentials should be valid JSON
      try {
        const parsed = JSON.parse(value);
        return (
          typeof parsed === 'object' &&
          parsed !== null &&
          'type' in parsed &&
          'project_id' in parsed &&
          'private_key' in parsed
        );
      } catch (e) {
        return false;
      }
    },
    errorMessage: 'GCP Service Account must be a valid JSON containing type, project_id, and private_key',
    placeholder: 'Enter GCP Service Account JSON',
  },
  REDPANDA_BROKERS: {
    validate: (value: string) => {
      // Validate comma-separated list of broker addresses (host:port)
      const brokerRegex = /^(?:[a-zA-Z0-9.-]+:\d+)(?:,[a-zA-Z0-9.-]+:\d+)*$/;
      return brokerRegex.test(value);
    },
    errorMessage: 'Redpanda brokers must be in format: host1:port1,host2:port2',
    placeholder: 'Enter Redpanda brokers (e.g. localhost:9092,broker:9092)',
  },
  GENERIC: {
    validate: () => true, // No validation required
    errorMessage: '',
    placeholder: 'Enter secret value',
  },
};

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
  const [secretName, setSecretName] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [isNormalizing, setIsNormalizing] = useState(false);

  // Get the list of existing secrets to check for duplicates
  const { data: secretList } = useListSecretsQuery();
  const { mutateAsync: createSecret } = useCreateSecretMutation();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      // Normalize the placeholder name to match the required pattern
      const normalizedPlaceholder = normalizeSecretName(placeholderName);
      setSecretName(normalizedPlaceholder);
      setSecretValue('');
      setIsValidating(false);
      setValidationError('');
      setIsNormalizing(normalizedPlaceholder !== placeholderName.toUpperCase());
    }
  }, [isOpen, placeholderName]);

  // Check if the secret name already exists
  const isSecretNameTaken = (name: string): boolean => {
    if (!secretList?.secrets) return false;
    const normalizedName = name.toUpperCase();
    return secretList.secrets.some((secret) => secret?.id?.toUpperCase() === normalizedName);
  };

  // Validate that the secret name follows the pattern
  const isValidSecretName = (name: string): boolean => {
    return SECRET_NAME_REGEX.test(name);
  };

  const handleCreateSecret = async (): Promise<void> => {
    setIsValidating(true);
    setValidationError('');
    console.log(`Validating secret of type: ${secretType}`);

    // First, check if the name matches the required pattern
    if (!isValidSecretName(secretName)) {
      const error =
        'Secret name must start with an uppercase letter and only contain uppercase letters, numbers, and underscores.';
      console.log(`Validation failed: ${error}`);
      setValidationError(error);
      setIsValidating(false);
      return;
    }

    // Check if the secret name is already taken
    if (isSecretNameTaken(secretName)) {
      const error = `Secret with name '${secretName}' already exists. Please use a different name.`;
      console.log(`Validation failed: ${error}`);
      setValidationError(error);
      setIsValidating(false);
      return;
    }

    // Validate the secret based on its type
    const validationRule = secretValidationRules[secretType];
    const isValid = validationRule.validate(secretValue);

    if (!isValid) {
      console.log(`Secret value validation failed for type: ${secretType}`);
      setValidationError(validationRule.errorMessage);
      setIsValidating(false);
      return;
    }

    console.log(`Creating secret: ${secretName}, type: ${secretType}`);
    try {
      await createSecret({
        request: new CreateSecretRequestDataPlane({
          id: secretName,
          secretData: base64ToUInt8Array(encodeBase64(secretValue)),
          scopes: [Scope.REDPANDA_CONNECT],
        }),
      });

      console.log(`Secret '${secretName}' created successfully`);

      // If the callback exists, pass the placeholder name and secret ID
      if (onSecretCreated) {
        onSecretCreated(placeholderName, secretName);
      }

      onClose();
    } catch (error) {
      console.error('Error creating secret:', error);
      setValidationError(`Failed to create secret: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <Modal size="xl" isOpen={isOpen} onClose={onClose}>
      <ModalContent>
        <ModalHeader>Add Secret for {placeholderName}</ModalHeader>
        <ModalBody>
          <VStack spacing={4}>
            <FormControl
              isInvalid={
                !!validationError &&
                (validationError.includes('already exists') || validationError.includes('must start'))
              }
            >
              <FormLabel fontSize="14px" fontWeight={500}>
                Secret Name
              </FormLabel>
              <Input
                placeholder="Enter secret name (UPPERCASE_WITH_UNDERSCORES)"
                value={secretName}
                onChange={(e) => {
                  // Normalize input as the user types to ensure it fits the pattern
                  // This shows the user immediately what their input will look like
                  const normalizedInput = normalizeSecretName(e.target.value);
                  setSecretName(normalizedInput);

                  // Clear validation errors related to secret name
                  if (validationError?.includes('already exists') || validationError?.includes('must start')) {
                    setValidationError('');
                  }

                  // Update normalization state
                  setIsNormalizing(normalizedInput !== e.target.value.toUpperCase());
                }}
              />
              {validationError &&
              (validationError.includes('already exists') || validationError.includes('must start')) ? (
                <FormErrorMessage>{validationError}</FormErrorMessage>
              ) : (
                <FormHelperText>
                  Secret name must start with an uppercase letter and only contain uppercase letters, numbers, and
                  underscores
                </FormHelperText>
              )}
            </FormControl>

            <FormControl
              isInvalid={
                !!validationError &&
                !validationError.includes('already exists') &&
                !validationError.includes('must start')
              }
            >
              <FormLabel fontSize="14px" fontWeight={500}>
                Secret Value
              </FormLabel>
              <Input
                placeholder={secretValidationRules[secretType].placeholder}
                value={secretValue}
                onChange={(e) => {
                  setSecretValue(e.target.value);
                  // Only clear validation errors related to value
                  if (
                    validationError &&
                    !validationError?.includes('already exists') &&
                    !validationError?.includes('must start')
                  ) {
                    setValidationError('');
                  }
                }}
              />
              {validationError &&
              !validationError?.includes('already exists') &&
              !validationError?.includes('must start') ? (
                <FormErrorMessage>{validationError}</FormErrorMessage>
              ) : (
                <FormHelperText>
                  {secretType !== 'GENERIC' ? (
                    <>
                      {secretType === 'POSTGRES_DSN' && (
                        <Text>Format: postgres://username:password@hostname:port/database</Text>
                      )}
                      {secretType === 'OPENAI_API_KEY' && (
                        <Text>Must start with "sk-" and be at least 30 characters</Text>
                      )}
                      {secretType === 'PASSWORD' && <Text>Must contain at least 1 digit and 1 special character</Text>}
                      {secretType === 'USERNAME' && <Text>Must be at least 8 characters long</Text>}
                      {secretType === 'GCP_SERVICE_ACCOUNT' && (
                        <Text>Must be valid JSON with type, project_id, and private_key fields</Text>
                      )}
                      {secretType === 'REDPANDA_BROKERS' && <Text>Format: host1:port1,host2:port2</Text>}
                    </>
                  ) : (
                    'No specific validation for this generic secret type'
                  )}
                </FormHelperText>
              )}
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <ButtonGroup>
            <Button onClick={handleCreateSecret} isLoading={isValidating} loadingText="Validating" variant="brand">
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
