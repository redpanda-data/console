import {
  Box,
  Button,
  Flex,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  Heading,
  Icon,
  Input,
  Select,
  Text,
  Tooltip,
  VStack,
  isSingleValue,
} from '@redpanda-data/ui';
import { useForm } from '@tanstack/react-form';
import {
  CreatePipelineRequest as CreatePipelineRequestDataPlane,
  PipelineCreate,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import type { Secret } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useEffect, useMemo, useState } from 'react';
import { FaSlack } from 'react-icons/fa';
import { MdAdd, MdChat, MdInfo, MdNewspaper } from 'react-icons/md';
import { REDPANDA_AI_AGENT_PIPELINE_PREFIX, useCreatePipelineMutationWithToast } from 'react-query/api/pipeline';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useHistory } from 'react-router-dom';
import { z } from 'zod';
import { AgentTemplateCard } from './agent-template-card';
import agentTemplate from './agent-template.yaml';
import indexingTemplate from './indexing.yaml';
import {
  AddSecretModal,
  type SecretSelection,
  type SecretType,
  determineSecretType,
  normalizeSecretName,
} from './secret-create-modal';

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

    // Skip if it starts with "this."
    if (extractedName.startsWith('this.')) {
      console.log(`Skipping placeholder starting with 'this.': ${extractedName}`);
      continue;
    }

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

    // Skip if it's a template function or already captured via secrets.NAME format or starts with "this."
    if (extractedName.includes('!') || fullMatch.includes('${secrets.') || extractedName.startsWith('this.')) {
      if (extractedName.startsWith('this.')) {
        console.log(`Skipping placeholder starting with 'this.': ${extractedName}`);
      }
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
  for (const { fullMatch, extractedName } of allMatches) {
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

  console.group('Secret placeholder replacement');
  console.log('Original template length:', yamlStr.length);
  console.log('Secret mapping to apply:', secretMap);

  // Track which secrets were used
  const usedSecrets: Record<string, boolean> = {};
  let replacementCount = 0;

  for (const [placeholder, secretId] of Object.entries(secretMap)) {
    // Skip empty or invalid entries
    if (!placeholder || !secretId) {
      console.log(`Skipping empty placeholder or secretId: ${placeholder} -> ${secretId}`);
      continue;
    }

    // Skip placeholders starting with 'this.'
    if (placeholder.startsWith('this.')) {
      console.log(`Skipping replacement for placeholder starting with 'this.': ${placeholder}`);
      continue;
    }

    // Normalize the secret ID to ensure it follows the required pattern
    const normalizedSecretId = normalizeSecretName(secretId);

    // Format the secret reference correctly with {SECRET_ID}
    const formattedSecretRef = `{${normalizedSecretId}}`;

    // Normalize the placeholder name for case-insensitive matching
    const normalizedPlaceholder = placeholder.toUpperCase();

    console.log(`Replacing placeholder '${placeholder}' with formatted reference '${formattedSecretRef}'`);

    // Create a regexp for each format the placeholder could appear in
    const formats = [
      // ${secrets.PLACEHOLDER}
      new RegExp(`\\$\\{secrets\\.${normalizedPlaceholder}\\}`, 'gi'),
      // ${PLACEHOLDER}
      new RegExp(`\\$\\{${normalizedPlaceholder}\\}(?!\\.)`, 'gi'),
    ];

    // Keep track of replacements for this placeholder
    let placeholderReplacementCount = 0;

    // Apply each format replacement
    for (const pattern of formats) {
      const beforeCount = result.length;
      result = result.replace(pattern, (match) => {
        // Double-check the match doesn't contain 'this.'
        if (match.includes('this.')) {
          console.log(`Skipping 'this.' prefixed match: ${match}`);
          return match; // Keep original
        }
        placeholderReplacementCount++;
        return formattedSecretRef;
      });

      // Check if any replacements were made with this pattern
      if (beforeCount !== result.length) {
        console.log(`  Pattern ${pattern} matched and replaced`);
      }
    }

    // Log results for this placeholder
    if (placeholderReplacementCount > 0) {
      console.log(`  Replaced ${placeholderReplacementCount} instances of '${placeholder}'`);
      usedSecrets[placeholder] = true;
      replacementCount += placeholderReplacementCount;
    } else {
      console.warn(`  No replacements made for '${placeholder}' - check if it exists in the template`);
    }
  }

  // Log summary of replacements
  console.log(`Total replacements: ${replacementCount}`);

  // Check if any secrets were not used
  const unusedSecrets = Object.keys(secretMap).filter((key) => !usedSecrets[key]);
  if (unusedSecrets.length > 0) {
    console.warn('Unused secrets - these placeholders might not exist in the template:', unusedSecrets);
  }

  console.groupEnd();
  return result;
};

/**
 * Interface for tracking auto-detected secrets
 */
interface AutoDetectedSecretInfo {
  isAutoDetected: boolean;
}

/**
 * Determine if a secret and placeholder have a matching relationship
 * @param secretId The secret ID
 * @param placeholderName The placeholder name
 * @returns True if there's any match (exact or partial), false otherwise
 */
const isSecretMatch = (secretId: string, placeholderName: string): boolean => {
  // Normalize both inputs to handle special characters consistently
  const normalizedSecretId = normalizeSecretName(secretId);
  const normalizedPlaceholder = normalizeSecretName(placeholderName);

  // Check for exact match with normalized values
  if (normalizedSecretId === normalizedPlaceholder) {
    return true;
  }

  // Check for partial matches with normalized values - prefixed or containing
  if (normalizedSecretId.includes(normalizedPlaceholder) || normalizedPlaceholder.includes(normalizedSecretId)) {
    return true;
  }

  // Handle special patterns like `USER_CONFIGURED_X` matching with just `X`
  const userConfiguredPrefix = 'USER_CONFIGURED_';
  if (normalizedSecretId.startsWith(userConfiguredPrefix)) {
    const secretWithoutPrefix = normalizedSecretId.substring(userConfiguredPrefix.length);
    if (
      secretWithoutPrefix === normalizedPlaceholder ||
      secretWithoutPrefix.includes(normalizedPlaceholder) ||
      normalizedPlaceholder.includes(secretWithoutPrefix)
    ) {
      return true;
    }
  }

  return false;
};

export const AgentCreatePage = () => {
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
    const agentPlaceholders = findSecretPlaceholders(JSON.stringify(agentTemplate));
    const indexingPlaceholders = findSecretPlaceholders(JSON.stringify(indexingTemplate));

    // Use a Map for deduplication with normalized name as key
    const dedupMap = new Map<string, { name: string; fullMatch: string; formats: string[] }>();

    // Process placeholders from both templates using for...of instead of forEach
    for (const placeholder of [...agentPlaceholders, ...indexingPlaceholders]) {
      const normalizedName = placeholder.name.toUpperCase();

      if (dedupMap.has(normalizedName)) {
        // Merge formats for existing placeholders - avoid non-null assertion
        const existing = dedupMap.get(normalizedName);
        if (!existing) continue; // Skip if for some reason the value is null or undefined

        // Combine formats without duplicates using for...of instead of forEach
        for (const format of placeholder.formats) {
          if (!existing.formats.includes(format)) {
            existing.formats.push(format);
          }
        }
      } else {
        // Add new placeholder
        dedupMap.set(normalizedName, {
          name: placeholder.name,
          fullMatch: placeholder.fullMatch,
          formats: [...placeholder.formats], // Clone to avoid reference issues
        });
      }
    }

    // Convert map back to array for rendering
    const uniquePlaceholders = Array.from(dedupMap.values());

    console.log('Deduplicated placeholders (across templates):', uniquePlaceholders);
    return uniquePlaceholders;
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
      let matchCount = 0;

      // For each placeholder, find a matching secret
      for (const placeholder of secretPlaceholders) {
        // Skip if user has already manually selected a secret for this placeholder
        if (selectedSecrets[placeholder.name]) continue;
        // Skip if already auto-detected
        if (autoDetectedSecrets[placeholder.name]) continue;

        // Try to find a matching secret using the normalized names for comparison
        const matchingSecret = secretList.secrets?.find(
          (secret) => secret?.id && isSecretMatch(secret.id, placeholder.name),
        );

        if (matchingSecret) {
          // Auto-select this secret
          newSelectedSecrets[placeholder.name] = matchingSecret;
          newAutoDetectedSecrets[placeholder.name] = true;
          matchCount++;
          console.log(`Auto-detected match for ${placeholder.name}: ${matchingSecret.id}`);
        }
      }

      // Update state if we found any new matches
      if (matchCount > 0) {
        setSelectedSecrets(newSelectedSecrets);
        setAutoDetectedSecrets(newAutoDetectedSecrets);
      }
    }
  }, [secretList, secretPlaceholders, secretsLoaded, selectedSecrets, autoDetectedSecrets]);

  // Effect to handle automatic selection of newly created secrets
  useEffect(() => {
    if (pendingSecretSelection && secretList?.secrets) {
      const { placeholderName, secretId } = pendingSecretSelection;

      // Find the secret with normalized ID comparison
      const normalizedSecretId = normalizeSecretName(secretId);
      const newSecret = secretList.secrets.find(
        (secret) => normalizeSecretName(secret?.id || '') === normalizedSecretId,
      );

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
      selectedConnector: 'fancy-agent',
      secretSelections: {},
    },
    onSubmit: async ({ value }) => {
      console.log('form value: ', value);

      // Prepare mapping of secret placeholders to actual secret IDs
      const secretMapping: Record<string, string> = {};

      // Create mapping from selected secrets, normalizing all secret IDs
      for (const [key, secret] of Object.entries(selectedSecrets)) {
        if (secret?.id) {
          // Ensure secret ID follows the required pattern
          secretMapping[key] = normalizeSecretName(secret.id);
        }
      }

      console.log('Secret mapping:', secretMapping);

      // Replace placeholders in YAML template
      const yamlTemplateStr = JSON.stringify(agentTemplate);
      const processedTemplate = replaceSecretPlaceholders(yamlTemplateStr, secretMapping);

      // Log the processed template
      console.log('Processed template with secret placeholders replaced:', processedTemplate);

      const processedTemplateObj = JSON.parse(processedTemplate);

      const createAgentResponse = await createAgent({
        request: new CreatePipelineRequestDataPlane({
          pipeline: new PipelineCreate({
            displayName: `${REDPANDA_AI_AGENT_PIPELINE_PREFIX}${value.name.toUpperCase()}`,
            description: value.description,
            configYaml: JSON.stringify(processedTemplateObj, null, 4),
          }),
        }),
      });

      if (createAgentResponse.response?.pipeline?.id) {
        history.push(`/agents/${createAgentResponse.response.pipeline.id}`);
      }
    },
  });

  /**
   * Handles connector selection
   */
  const handleConnectorSelect = (id: string): void => {
    setSelectedConnector(id);
    form.setFieldValue('selectedConnector', id);
  };

  /**
   * Handles secret selection from dropdown
   */
  const handleSecretSelect = (key: string, secret: Secret | undefined, isNewlyCreated = false): void => {
    // Check if the secret ID contains special characters that will be normalized
    let secretNormalizationInfo = '';

    if (secret?.id) {
      const normalizedId = normalizeSecretName(secret.id);
      if (normalizedId !== secret.id) {
        secretNormalizationInfo = `Note: Secret ID "${secret.id}" will be normalized to "${normalizedId}" to match required pattern`;
        console.log(secretNormalizationInfo);
      }
    }

    setSelectedSecrets((prev) => ({
      ...prev,
      [key]: secret,
    }));

    // Update the form value for selected secrets
    const currentSecretSelections = form.getFieldValue('secretSelections') || {};
    form.setFieldValue('secretSelections', {
      ...currentSecretSelections,
      [key]: secret?.id,
    });

    // If this is a newly created secret, check if it's a match for auto-detection
    if (isNewlyCreated && secret?.id && isSecretMatch(secret.id, key)) {
      setAutoDetectedSecrets((prev) => ({
        ...prev,
        [key]: true,
      }));
    }
    // Remove from auto-detected if user manually changed it
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
                      onChange: (value) => {
                        if (!value || value.length === 0) {
                          return 'Agent name is required';
                        }
                        return undefined;
                      },
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
                        {field.state.meta.errors?.length > 0 && (
                          <FormErrorMessage>{String(field.state.meta.errors[0])}</FormErrorMessage>
                        )}
                      </FormControl>
                    )}
                  </form.Field>

                  <form.Field
                    name="description"
                    validators={{
                      onChange: (value) => {
                        if (!value || value.length === 0) {
                          return 'Description is required';
                        }
                        return undefined;
                      },
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
                        {field.state.meta.errors?.length > 0 && (
                          <FormErrorMessage>{String(field.state.meta.errors[0])}</FormErrorMessage>
                        )}
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

                <form.Field
                  name="selectedConnector"
                  validators={{
                    onChange: (value) => {
                      if (!value || value.length === 0) {
                        return 'You must select a connector';
                      }
                      return undefined;
                    },
                  }}
                >
                  {(field) => (
                    <FormControl isInvalid={!!field.state.meta.errors?.length}>
                      <Flex flexWrap="wrap" gap={5} mb={6}>
                        <AgentTemplateCard
                          id="fancy-agent"
                          title="New message received"
                          subtitle="Fancy Agent Name"
                          description="This is a description this could be as long as three lines but then it keeps going until it gets truncate..."
                          icon={<Icon as={MdChat} boxSize={6} />}
                          isSelected={selectedConnector === 'fancy-agent'}
                          onClick={(id) => {
                            handleConnectorSelect(id);
                            field.handleChange(id);
                          }}
                        />
                        <AgentTemplateCard
                          id="rest-api"
                          title="New HTTP request"
                          subtitle="REST API"
                          description="This is a description this could be as long as three lines but then it keeps going until it gets truncate..."
                          icon={<Icon as={MdNewspaper} boxSize={6} />}
                          isSelected={selectedConnector === 'rest-api'}
                          isDisabled
                          onClick={handleConnectorSelect}
                        />
                        <AgentTemplateCard
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
                      {field.state.meta.errors?.length > 0 && (
                        <FormErrorMessage>{String(field.state.meta.errors[0])}</FormErrorMessage>
                      )}
                    </FormControl>
                  )}
                </form.Field>
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
                </Box>

                {/* Summary of auto-detected secrets */}
                {Object.keys(autoDetectedSecrets).length > 0 && (
                  <Box mb={6} p={4} borderRadius="md" bgColor="green.50" borderLeft="4px solid" borderColor="green.500">
                    <Flex alignItems="center" mb={2}>
                      <Icon as={MdAdd} color="green.500" mr={2} />
                      <Text fontWeight={600} fontSize="14px" color="green.700">
                        Auto-detected secrets
                      </Text>
                    </Flex>
                    <Text fontSize="12px" color="gray.600">
                      You can change these selections in the form below if needed.
                    </Text>
                  </Box>
                )}

                <VStack spacing={4} align="stretch" maxWidth="500px">
                  {secretPlaceholders.map((placeholder) => {
                    // Check if the selected secret for this placeholder needs normalization
                    const selectedSecret = selectedSecrets[placeholder.name];
                    const needsNormalization =
                      selectedSecret?.id && normalizeSecretName(selectedSecret.id) !== selectedSecret.id;

                    // Determine if this placeholder might need specific validation
                    const secretType = determineSecretType(placeholder.name);
                    const needsSpecialValidation = secretType !== 'GENERIC';

                    return (
                      <FormControl key={placeholder.name}>
                        <FormLabel fontSize="14px" fontWeight={500}>
                          <Text>{placeholder.name}</Text>
                        </FormLabel>
                        <Flex gap={2}>
                          <Box flex="1">
                            <Select<Secret | undefined>
                              onChange={(val) => {
                                if (val && isSingleValue(val) && val.value) {
                                  handleSecretSelect(placeholder.name, val.value, false);
                                } else {
                                  handleSecretSelect(placeholder.name, undefined, false);
                                }
                              }}
                              options={availableSecrets}
                              placeholder={'Select secret'}
                              value={availableSecrets.find(
                                (opt) => opt.value?.id === selectedSecrets[placeholder.name]?.id,
                              )}
                            />
                            {needsNormalization && (
                              <Text fontSize="12px" color="orange.500" mt={1}>
                                Note: Secret ID will be normalized to "{normalizeSecretName(selectedSecret.id)}"
                              </Text>
                            )}
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
                      </FormControl>
                    );
                  })}
                </VStack>
              </Box>

              {/* Footer with action buttons */}
              <Flex gap={4} pt={6}>
                <form.Subscribe>
                  {({ canSubmit, isSubmitting }) => (
                    <Button
                      type="submit"
                      variant="brand"
                      isLoading={isSubmitting}
                      isDisabled={!canSubmit}
                      loadingText="Creating"
                    >
                      Create Agent
                    </Button>
                  )}
                </form.Subscribe>
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
