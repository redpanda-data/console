import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  Card,
  CardBody,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  Heading,
  Icon,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  Text,
  VStack,
  isSingleValue,
  useToast,
} from '@redpanda-data/ui';
import { useForm } from '@tanstack/react-form';
import {
  CreatePipelineRequest as CreatePipelineRequestDataPlane,
  PipelineCreate,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { Scope, type Secret } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { CreateSecretRequest as CreateSecretRequestDataPlane } from 'protogen/redpanda/api/dataplane/v1alpha2/secret_pb';
import { useEffect, useMemo, useState } from 'react';
import { FaSlack } from 'react-icons/fa';
import { MdAdd, MdChat, MdNewspaper } from 'react-icons/md';
import { REDPANDA_AI_AGENT_PIPELINE_PREFIX, useCreatePipelineMutationWithToast } from 'react-query/api/pipeline';
import { useCreateSecretMutation, useListSecretsQuery } from 'react-query/api/secret';
import { useHistory } from 'react-router-dom';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';
import { z } from 'zod';
import agentTemplate2 from './agent-template-2.yaml';
import agentTemplate from './agent-template.yaml';
import pipelineTemplate from './pipeline-template.yaml';

/**
 * Schema for agent form validation
 */
const agentFormSchema = z.object({
  name: z.string().min(1, 'Agent name is required'),
  description: z.string().min(1, 'Description is required'),
  // openAiToken: z.string().min(1, 'OpenAI token is required'),
  // postgresConnectionUrl: z.string().min(1, 'Postgres connection URL is required'),
  // pineconeApiKey: z.string().min(1, 'Pinecone API key is required'),
  // pineconeIndexName: z.string().min(1, 'Pinecone index name is required'),
  // pineconeNamespace: z.string().min(1, 'Pinecone namespace is required'),
});

/**
 * Interface for connector properties displayed in selection cards
 */
interface ConnectorProps {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactElement;
  isSelected: boolean;
  isDisabled?: boolean;
  onClick: (id: string) => void;
}

/**
 * ConnectorCard component - Displays a selectable card for agent connectors
 */
const ConnectorCard = ({
  id,
  title,
  subtitle,
  description,
  icon,
  isSelected,
  isDisabled = false,
  onClick,
}: ConnectorProps): JSX.Element => {
  const handleClick = (): void => {
    if (!isDisabled) {
      onClick(id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!isDisabled) {
        onClick(id);
      }
    }
  };

  return (
    <Card
      width="324px"
      borderWidth={isSelected ? '2px' : '1px'}
      borderColor={isSelected ? 'rgba(22, 31, 46, 0.7)' : 'rgba(22, 31, 46, 0.3)'}
      borderRadius="8px"
      opacity={isDisabled ? 0.5 : 1}
      cursor={isDisabled ? 'not-allowed' : 'pointer'}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-label={`Select ${title} connector`}
      _hover={!isDisabled ? { boxShadow: 'sm' } : {}}
    >
      <CardBody padding="16px 18px">
        <Flex direction="column" gap="6px">
          <Box mb="2">{icon}</Box>
          <Flex direction="column" gap="-1px">
            <Text fontSize="12px" fontWeight="600" lineHeight="1.4">
              {title}
            </Text>
            <Text fontSize="16px" fontWeight="600" lineHeight="1.3">
              {subtitle}
            </Text>
          </Flex>
          <Text fontSize="14px" lineHeight="1.4" color="rgba(0, 0, 0, 0.8)" noOfLines={3}>
            {description}
          </Text>
          <Badge alignSelf="flex-start" fontSize="12px" fontWeight="400" borderRadius="14px" padding="4px 8px">
            Documentation
          </Badge>
        </Flex>
      </CardBody>
    </Card>
  );
};

/**
 * Interface for secret selection state
 */
interface SecretSelection {
  [key: string]: Secret | undefined;
}

/**
 * Secret types with their validation rules
 */
type SecretType =
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
    validate: (value: string) => /^postgres:\/\/[^:]+:[^@]+@[^:]+:\d+\/\w+$/.test(value),
    errorMessage: 'PostgresDSN must be in format: postgres://postgres:123456@127.0.0.1:5432/dummy',
    placeholder: 'Enter Postgres DSN (e.g. postgres://user:pass@host:port/db)',
  },
  OPENAI_API_KEY: {
    validate: (value: string) => value.startsWith('sk-'),
    errorMessage: 'OpenAI API key must start with "sk-"',
    placeholder: 'Enter OpenAI API key (starts with sk-)',
  },
  GCP_SERVICE_ACCOUNT: {
    validate: (value: string) => value.length >= 8,
    errorMessage: 'GCP Service Account must be at least 8 characters',
    placeholder: 'Enter GCP Service Account (min 8 chars)',
  },
  REDPANDA_BROKERS: {
    validate: () => true, // No validation required
    errorMessage: '',
    placeholder: 'Enter Redpanda brokers',
  },
  GENERIC: {
    validate: () => true, // No validation required
    errorMessage: '',
    placeholder: 'Enter secret value',
  },
};

/**
 * Determine the secret type based on the placeholder name
 * @param name The name of the placeholder
 * @returns The type of secret
 */
const determineSecretType = (name: string): SecretType => {
  name = name.toUpperCase();
  if (name === 'USERNAME') return 'USERNAME';
  if (name === 'PASSWORD') return 'PASSWORD';
  if (name === 'POSTGRES_DSN') return 'POSTGRES_DSN';
  if (name === 'OPENAI_API_KEY') return 'OPENAI_API_KEY';
  if (name === 'GCP_SERVICE_ACCOUNT') return 'GCP_SERVICE_ACCOUNT';
  if (name === 'REDPANDA_BROKERS') return 'REDPANDA_BROKERS';
  return 'GENERIC';
};

/**
 * Finds all secret placeholders in a YAML string in the format ${secrets.SECRET_NAME} or ${SECRET_NAME}
 * @param yamlStr - The YAML string to parse
 * @returns Array of unique secret placeholder objects with name and full match
 */
const findSecretPlaceholders = (yamlStr: string): Array<{ name: string; fullMatch: string; formats: string[] }> => {
  // Match both ${secrets.NAME} and ${NAME} formats
  const secretsRegex = /\${secrets\.([^}]+)}/g;
  const simpleRegex = /\${([^!{}]+)}/g;

  // Use a map to track unique placeholder names (normalized to ensure uniqueness)
  const placeholderMap = new Map<string, { name: string; fullMatch: string; formats: string[] }>();

  // First pass: collect all matches
  const allMatches: Array<{ fullMatch: string; extractedName: string; originalFormat: string }> = [];

  // Process ${secrets.NAME} format
  let match: RegExpExecArray | null;
  while ((match = secretsRegex.exec(yamlStr)) !== null) {
    const fullMatch = match[0];
    const extractedName = match[1];

    allMatches.push({
      fullMatch,
      extractedName,
      originalFormat: `secrets.${extractedName}`,
    });
  }

  // Reset regex state
  simpleRegex.lastIndex = 0;

  // Process ${NAME} format (excluding expressions with ! which are template functions)
  while ((match = simpleRegex.exec(yamlStr)) !== null) {
    const fullMatch = match[0];
    const extractedName = match[1];

    // Skip if it's a template function or already captured via secrets.NAME format
    if (extractedName.includes('!') || fullMatch.includes('${secrets.')) {
      continue;
    }

    allMatches.push({
      fullMatch,
      extractedName,
      originalFormat: extractedName,
    });
  }

  // Debug log to verify matches
  console.log('All placeholder matches:', allMatches);

  // Second pass: normalize and group by normalized name
  for (const { fullMatch, extractedName, originalFormat } of allMatches) {
    // Normalize the name for comparison (uppercase)
    const normalizedName = extractedName.toUpperCase();

    if (placeholderMap.has(normalizedName)) {
      // Add this format to existing placeholder if not already included
      const existing = placeholderMap.get(normalizedName);
      if (existing && !existing.formats.includes(fullMatch)) {
        existing.formats.push(fullMatch);
      }
    } else {
      // Create new placeholder entry
      placeholderMap.set(normalizedName, {
        name: extractedName, // Keep original case for display
        fullMatch,
        formats: [fullMatch],
      });
    }
  }

  // Convert map to array for return
  const result = Array.from(placeholderMap.values());

  // Debug log to verify final result
  console.log('Deduplicated placeholders:', result);

  return result;
};

/**
 * Replaces secret placeholders in a YAML string with actual secret values
 * @param yamlStr - The YAML string with placeholders
 * @param secretMap - Map of placeholder names to secret values
 * @returns Updated YAML string with placeholders replaced by actual values
 */
const replaceSecretPlaceholders = (yamlStr: string, secretMap: Record<string, string>): string => {
  let result = yamlStr;

  console.log('Original template:', yamlStr);
  console.log('Secret mapping to apply:', secretMap);

  for (const [placeholder, secretId] of Object.entries(secretMap)) {
    // Format the secret reference correctly with ${secrets.SECRET_ID}
    // const formattedSecretRef = `\${secrets.${secretId}}`;
    const formattedSecretRef = `{${secretId}}`;
    // Normalize the placeholder name to ensure case-insensitive matching
    const normalizedPlaceholder = placeholder.toUpperCase();

    console.log(`Replacing placeholder '${placeholder}' with formatted reference '${formattedSecretRef}'`);

    // Replace ${secrets.NAME} format (case insensitive)
    const secretsRegex = new RegExp(`\\$\\{secrets\\.${normalizedPlaceholder}\\}`, 'gi');
    result = result.replace(secretsRegex, formattedSecretRef);

    // Replace ${NAME} format directly (case insensitive), but carefully to avoid replacing template functions
    const directRegex = new RegExp(`\\$\\{${normalizedPlaceholder}\\}(?!\\.)`, 'gi');
    result = result.replace(directRegex, formattedSecretRef);
  }

  return result;
};

export const AgentCreatePage = () => {
  const toast = useToast();
  const [selectedConnector, setSelectedConnector] = useState<string>('fancy-agent');
  const [isAddSecretModalOpen, setIsAddSecretModalOpen] = useState(false);
  const [selectedSecrets, setSelectedSecrets] = useState<SecretSelection>({});
  const [currentSecretType, setCurrentSecretType] = useState<SecretType>('GENERIC');
  const [currentPlaceholderName, setCurrentPlaceholderName] = useState<string>('');
  const [pendingSecretSelection, setPendingSecretSelection] = useState<{
    placeholderName: string;
    secretId: string;
  } | null>(null);
  const [autoDetectedSecrets, setAutoDetectedSecrets] = useState<Record<string, boolean>>({});

  const { data: secretList, isSuccess: secretsLoaded } = useListSecretsQuery();
  const { mutateAsync: createAgent } = useCreatePipelineMutationWithToast();

  // Use react-router-dom v5 history object because we don't want to touch MobX state
  const history = useHistory();

  const availableSecrets =
    secretList?.secrets?.map((secret) => ({
      label: secret?.id,
      value: secret,
    })) ?? [];

  // Find all secret placeholders in the agent template
  const secretPlaceholders = useMemo(() => {
    return findSecretPlaceholders(JSON.stringify(agentTemplate));
  }, []);

  // Log found placeholders for debugging
  useMemo(() => {
    console.log('Secret placeholders found:', secretPlaceholders);
  }, [secretPlaceholders]);

  // Auto-detect and prefill secrets that match placeholder naming convention
  useEffect(() => {
    if (secretsLoaded && secretList?.secrets && secretPlaceholders.length > 0) {
      const newAutoDetectedSecrets = { ...autoDetectedSecrets };
      const newSelectedSecrets = { ...selectedSecrets };
      let newDetectionsCount = 0;

      // For each placeholder, find a matching secret
      for (const placeholder of secretPlaceholders) {
        // Skip if user has already manually selected a secret for this placeholder
        if (selectedSecrets[placeholder.name]) continue;
        // Skip if already auto-detected
        if (autoDetectedSecrets[placeholder.name]) continue;

        // Try to find a secret with exact match to placeholder name
        const matchingSecret = secretList.secrets?.find(
          (secret) => secret?.id && secret.id.toUpperCase() === placeholder.name.toUpperCase(),
        );

        if (matchingSecret) {
          // Auto-select this secret
          newSelectedSecrets[placeholder.name] = matchingSecret;
          newAutoDetectedSecrets[placeholder.name] = true;
          newDetectionsCount++;
          console.log(`Auto-detected secret for ${placeholder.name}: ${matchingSecret.id}`);
        }
      }

      // Update state if we found any new matches
      if (newDetectionsCount > 0) {
        setSelectedSecrets(newSelectedSecrets);
        setAutoDetectedSecrets(newAutoDetectedSecrets);

        toast({
          title: 'Secrets auto-detected',
          description: `${newDetectionsCount} secrets were automatically matched with placeholders.`,
          status: 'info',
          duration: 5000,
          isClosable: true,
        });
      }
    }
  }, [secretList, secretPlaceholders, secretsLoaded, selectedSecrets, autoDetectedSecrets, toast]);

  // Effect to handle automatic selection of newly created secrets
  useEffect(() => {
    if (pendingSecretSelection && secretList?.secrets) {
      const { placeholderName, secretId } = pendingSecretSelection;
      const newSecret = secretList.secrets.find((secret) => secret?.id === secretId);

      if (newSecret) {
        // Select the new secret in the dropdown
        handleSecretSelect(placeholderName, newSecret, true);
        // Clear the pending selection
        setPendingSecretSelection(null);
      }
    }
  }, [secretList, pendingSecretSelection]);

  const form = useForm({
    defaultValues: {
      name: 'Redpanda Knowledge',
      description: 'Can answer any questions about Redpanda based on the internal knowledge',
    },
    validators: {
      onChange: agentFormSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        console.log('form value: ', value);

        // Prepare mapping of secret placeholders to actual secret IDs
        const secretMapping: Record<string, string> = {};

        // Create mapping from selected secrets
        for (const [key, secret] of Object.entries(selectedSecrets)) {
          if (secret?.id) {
            secretMapping[key] = `${secret.id}`;
          }
        }

        console.log('Secret mapping:', secretMapping);

        // Replace placeholders in YAML template
        const yamlTemplateStr = JSON.stringify(agentTemplate);
        const processedTemplate = replaceSecretPlaceholders(yamlTemplateStr, secretMapping);

        // Log the processed template
        console.log('Processed template with secret placeholders replaced:', processedTemplate);

        const processedTemplateObj = JSON.parse(processedTemplate);

        await createAgent({
          request: new CreatePipelineRequestDataPlane({
            pipeline: new PipelineCreate({
              displayName: `${REDPANDA_AI_AGENT_PIPELINE_PREFIX}${value.name.toUpperCase()}`,
              description: value.description,
              configYaml: JSON.stringify(processedTemplateObj, null, 4),
            }),
          }),
        });

        history.push('/agents');
      } catch (error) {
        toast({
          title: 'Error creating agent',
          description: 'An error occurred while creating the agent.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    },
  });

  /**
   * Handles connector selection
   */
  const handleConnectorSelect = (id: string): void => {
    setSelectedConnector(id);
  };

  /**
   * Handles secret selection from dropdown
   */
  const handleSecretSelect = (key: string, secret: Secret | undefined, isNewlyCreated = false): void => {
    setSelectedSecrets((prev) => ({
      ...prev,
      [key]: secret,
    }));

    // If this is a newly created secret that matches its placeholder name, mark it as auto-detected
    if (isNewlyCreated && secret?.id && secret.id.toUpperCase() === key.toUpperCase()) {
      setAutoDetectedSecrets((prev) => ({
        ...prev,
        [key]: true,
      }));
    }
    // Only remove from auto-detected if not newly created and user manually changed it
    else if (!isNewlyCreated && autoDetectedSecrets[key]) {
      setAutoDetectedSecrets((prev) => {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      });
    }

    console.log(`Selected secret for ${key}:`, secret?.id);
  };

  /**
   * Opens the Add Secret modal for a specific placeholder
   * @param placeholderName The name of the placeholder to add a secret for
   */
  const handleOpenAddSecretModal = (placeholderName: string): void => {
    setCurrentSecretType(determineSecretType(placeholderName));
    setCurrentPlaceholderName(placeholderName);
    setIsAddSecretModalOpen(true);
  };

  return (
    <Box>
      <VStack align="stretch" spacing={8}>
        <VStack spacing={8} align="stretch">
          <Heading as="h1" size="lg" fontWeight={600}>
            Create new Agent
          </Heading>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
          >
            <VStack spacing={8} align="stretch">
              {/* General Section */}
              <Box>
                <Heading as="h2" size="md" mb={4} fontWeight={600}>
                  General
                </Heading>
                <VStack spacing={4} align="stretch">
                  <form.Field
                    name="name"
                    validators={{
                      onChange: agentFormSchema.shape.name,
                      onBlur: agentFormSchema.shape.name,
                    }}
                  >
                    {(field) => (
                      <FormControl isRequired isInvalid={!!field.state.meta.errors?.length}>
                        <FormLabel fontSize="12px" fontWeight={600}>
                          Agent name
                        </FormLabel>
                        <Input
                          name="name"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          placeholder="Enter agent name"
                          borderColor="#A0AEC0"
                          borderRadius="6px"
                          height="34px"
                          fontSize="14px"
                        />
                      </FormControl>
                    )}
                  </form.Field>

                  <form.Field
                    name="description"
                    validators={{
                      onChange: agentFormSchema.shape.description,
                      onBlur: agentFormSchema.shape.description,
                    }}
                  >
                    {(field) => (
                      <FormControl isRequired isInvalid={!!field.state.meta.errors?.length}>
                        <FormLabel fontSize="12px" fontWeight={600}>
                          Description
                        </FormLabel>
                        <Input
                          name="description"
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          onBlur={field.handleBlur}
                          placeholder="Enter agent description"
                          borderColor="#A0AEC0"
                          borderRadius="6px"
                          height="34px"
                          fontSize="14px"
                        />
                      </FormControl>
                    )}
                  </form.Field>
                </VStack>
              </Box>

              {/* Agent Section */}
              <Box>
                <Heading as="h2" size="md" mb={4} fontWeight={600}>
                  Agent
                </Heading>

                <Flex flexWrap="wrap" gap={5} mb={6}>
                  <ConnectorCard
                    id="fancy-agent"
                    title="New message received"
                    subtitle="Fancy Agent Name"
                    description="This is a description this could be as long as three lines but then it keeps going until it gets truncate..."
                    icon={<Icon as={MdChat} boxSize={6} />}
                    isSelected={selectedConnector === 'fancy-agent'}
                    onClick={handleConnectorSelect}
                  />
                  <ConnectorCard
                    id="rest-api"
                    title="New HTTP request"
                    subtitle="REST API"
                    description="This is a description this could be as long as three lines but then it keeps going until it gets truncate..."
                    icon={<Icon as={MdNewspaper} boxSize={6} />}
                    isSelected={selectedConnector === 'rest-api'}
                    isDisabled
                    onClick={handleConnectorSelect}
                  />
                  <ConnectorCard
                    id="slack-bot"
                    title="New event in slack"
                    subtitle="Slack Bot"
                    description="This is a description this could be as long as three lines but then it keeps going until it gets truncate..."
                    icon={<Icon as={FaSlack} boxSize={6} />}
                    isSelected={selectedConnector === 'slack-bot'}
                    isDisabled
                    onClick={handleConnectorSelect}
                  />
                </Flex>
              </Box>

              {/* Configurations Section */}
              <Box>
                <Box mb={4}>
                  <Heading as="h2" size="md" mb={2} fontWeight={600}>
                    Configurations
                  </Heading>
                  <Text fontSize="14px" lineHeight="1.5">
                    Provide the required configurations for your agent. Secrets will be stored in your dataplane's
                    secret store and can be re-used across agents.
                  </Text>
                  <Text fontSize="14px" lineHeight="1.5" color="gray.600" mt={1}>
                    <Text as="span" fontWeight={600} color="green.600">
                      Auto-detection:
                    </Text>{' '}
                    The system automatically matches existing secrets with placeholders that have the same name, making
                    it easier to create agents with minimal configuration.
                  </Text>
                </Box>

                {/* Summary of auto-detected secrets */}
                {Object.keys(autoDetectedSecrets).length > 0 && (
                  <Box mb={6} p={4} borderRadius="md" bgColor="green.50" borderLeft="4px solid" borderColor="green.500">
                    <Flex alignItems="center" mb={2}>
                      <Icon as={MdAdd} color="green.500" mr={2} />
                      <Text fontWeight={600} fontSize="14px" color="green.700">
                        Auto-detected Secrets
                      </Text>
                    </Flex>
                    <Text fontSize="14px" color="gray.700" mb={2}>
                      The following secrets were automatically matched with placeholders based on naming conventions:
                    </Text>
                    <Box pl={2}>
                      {Object.keys(autoDetectedSecrets).map((placeholderName) => (
                        <HStack key={placeholderName} fontSize="14px" spacing={1}>
                          <Text fontWeight={600}>{placeholderName}</Text>
                          <Text>→</Text>
                          <Text>{selectedSecrets[placeholderName]?.id}</Text>
                        </HStack>
                      ))}
                    </Box>
                    <Text fontSize="12px" color="gray.600" mt={2}>
                      You can change these selections in the form below if needed.
                    </Text>
                  </Box>
                )}

                <VStack spacing={4} align="stretch" maxWidth="500px">
                  {secretPlaceholders.map((placeholder) => (
                    <FormControl key={placeholder.name}>
                      <FormLabel fontSize="14px" fontWeight={500}>
                        {placeholder.name}
                        {autoDetectedSecrets[placeholder.name] && (
                          <Badge ml={2} fontSize="10px">
                            Auto-detected
                          </Badge>
                        )}
                      </FormLabel>
                      <Flex gap={2}>
                        <Box flex="1">
                          <Select<Secret | undefined>
                            onChange={(val) => {
                              if (val && isSingleValue(val) && val.value) {
                                handleSecretSelect(placeholder.name, val.value, false);
                              }
                            }}
                            options={availableSecrets}
                            placeholder={`Select ${placeholder.name} secret`}
                            value={availableSecrets.find(
                              (opt) => opt.value?.id === selectedSecrets[placeholder.name]?.id,
                            )}
                          />
                        </Box>
                        <Button
                          onClick={() => {
                            handleOpenAddSecretModal(placeholder.name);
                          }}
                        >
                          <HStack>
                            <Icon as={MdAdd} boxSize={4} />
                            <Text>Add Secret</Text>
                          </HStack>
                        </Button>
                      </Flex>
                      <FormHelperText fontSize="14px" color="#64748B">
                        Secret value for{' '}
                        {placeholder.formats.length > 1 ? placeholder.formats.join(', ') : placeholder.fullMatch}
                        {autoDetectedSecrets[placeholder.name] && (
                          <Text as="span" color="green.500" ml={1}>
                            (automatically matched with existing secret)
                          </Text>
                        )}
                      </FormHelperText>
                    </FormControl>
                  ))}
                </VStack>
              </Box>

              {/* Footer with action buttons */}
              <Flex gap={4} pt={6}>
                <form.Subscribe>
                  {({ canSubmit, isSubmitting }) => (
                    <Button
                      type="submit"
                      bgColor="#E86B54"
                      color="white"
                      height="40px"
                      px={6}
                      fontWeight={600}
                      fontSize="14px"
                      isLoading={isSubmitting}
                      loadingText="Creating"
                      isDisabled={!canSubmit}
                      _hover={{ bg: '#D85C45' }}
                      leftIcon={
                        Object.keys(autoDetectedSecrets).length > 0 ? <Icon as={MdAdd} boxSize={5} /> : undefined
                      }
                    >
                      {Object.keys(autoDetectedSecrets).length > 0
                        ? `Create with ${Object.keys(autoDetectedSecrets).length} Auto-Detected Secrets`
                        : 'Create Agent'}
                    </Button>
                  )}
                </form.Subscribe>
                {Object.keys(autoDetectedSecrets).length > 0 && (
                  <Badge colorScheme="green" variant="subtle" fontSize="12px" alignSelf="center" py={1} px={2}>
                    One-click deploy ready
                  </Badge>
                )}
              </Flex>
            </VStack>
          </form>
        </VStack>
      </VStack>
      <AddSecretModal
        isOpen={isAddSecretModalOpen}
        onClose={() => setIsAddSecretModalOpen(false)}
        secretType={currentSecretType}
        placeholderName={currentPlaceholderName}
        onSecretCreated={(placeholderName, secretId) => {
          // Store the pending secret selection to be processed when secretList updates
          setPendingSecretSelection({ placeholderName, secretId });
        }}
      />
    </Box>
  );
};

interface AddSecretModalProps {
  isOpen: boolean;
  onClose: () => void;
  secretType: SecretType;
  placeholderName: string;
  onSecretCreated?: (placeholderName: string, secretId: string) => void;
}

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
  const toast = useToast();

  // Get the list of existing secrets to check for duplicates
  const { data: secretList } = useListSecretsQuery();
  const { mutateAsync: createSecret } = useCreateSecretMutation();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSecretName(placeholderName.toUpperCase());
      setSecretValue('');
      setIsValidating(false);
      setValidationError('');
    }
  }, [isOpen, placeholderName]);

  // Check if the secret name already exists
  const isSecretNameTaken = (name: string): boolean => {
    if (!secretList?.secrets) return false;
    const normalizedName = name.toUpperCase();
    return secretList.secrets.some((secret) => secret?.id?.toUpperCase() === normalizedName);
  };

  const handleCreateSecret = async (): Promise<void> => {
    setIsValidating(true);

    // First check if the secret name is already taken
    const normalizedSecretName = secretName.toUpperCase();
    if (isSecretNameTaken(normalizedSecretName)) {
      setValidationError(`Secret with name '${normalizedSecretName}' already exists. Please use a different name.`);
      setIsValidating(false);
      return;
    }

    // Validate the secret based on its type
    const validationRule = secretValidationRules[secretType];
    const isValid = validationRule.validate(secretValue);

    if (!isValid) {
      setValidationError(validationRule.errorMessage);
      setIsValidating(false);
      return;
    }

    try {
      await createSecret({
        request: new CreateSecretRequestDataPlane({
          id: normalizedSecretName,
          secretData: base64ToUInt8Array(encodeBase64(secretValue)),
          scopes: [Scope.REDPANDA_CONNECT],
        }),
      });

      toast({
        title: 'Secret created',
        description: `Successfully created secret for ${placeholderName}`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      // If the callback exists, pass the placeholder name and secret ID
      if (onSecretCreated) {
        onSecretCreated(placeholderName, normalizedSecretName);
      }

      onClose();
    } catch (error) {
      toast({
        title: 'Error creating secret',
        description: 'An error occurred while creating the secret.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
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
            <FormControl isInvalid={!!validationError && validationError.includes('already exists')}>
              <FormLabel fontSize="14px" fontWeight={500}>
                Secret Name
              </FormLabel>
              <Input
                placeholder="Enter secret name"
                value={secretName}
                onChange={(e) => {
                  setSecretName(e.target.value);
                  // Clear validation error when user changes the name
                  if (validationError?.includes('already exists')) {
                    setValidationError('');
                  }
                }}
              />
              {validationError?.includes('already exists') ? (
                <FormErrorMessage>{validationError}</FormErrorMessage>
              ) : (
                <FormHelperText>This will be the ID used to reference this secret.</FormHelperText>
              )}
            </FormControl>

            <FormControl isInvalid={!!validationError && !validationError.includes('already exists')}>
              <FormLabel fontSize="14px" fontWeight={500}>
                Secret Value
              </FormLabel>
              <Input
                placeholder={secretValidationRules[secretType].placeholder}
                value={secretValue}
                onChange={(e) => {
                  setSecretValue(e.target.value);
                  // Only clear non-duplicate name validation errors
                  if (validationError && !validationError?.includes('already exists')) {
                    setValidationError('');
                  }
                }}
              />
              {validationError && !validationError?.includes('already exists') ? (
                <FormErrorMessage>{validationError}</FormErrorMessage>
              ) : (
                <FormHelperText>
                  {secretType !== 'GENERIC'
                    ? `This field has validation for ${secretType.replace(/_/g, ' ').toLowerCase()}`
                    : 'No specific validation required for this secret type.'}
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
