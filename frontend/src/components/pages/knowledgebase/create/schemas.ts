import { create } from '@bufbuild/protobuf';
import { SASLMechanism } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import {
  type KnowledgeBaseCreate,
  KnowledgeBaseCreate_EmbeddingGenerator_Provider_CohereSchema,
  KnowledgeBaseCreate_EmbeddingGenerator_Provider_OpenAISchema,
  KnowledgeBaseCreate_EmbeddingGenerator_ProviderSchema,
  KnowledgeBaseCreate_EmbeddingGeneratorSchema,
  KnowledgeBaseCreate_Generation_Provider_OpenAISchema,
  KnowledgeBaseCreate_Generation_ProviderSchema,
  KnowledgeBaseCreate_GenerationSchema,
  KnowledgeBaseCreate_IndexerSchema,
  KnowledgeBaseCreate_Retriever_Reranker_Provider_CohereSchema,
  KnowledgeBaseCreate_Retriever_Reranker_ProviderSchema,
  KnowledgeBaseCreate_Retriever_RerankerSchema,
  KnowledgeBaseCreate_RetrieverSchema,
  KnowledgeBaseCreate_VectorDatabase_PostgresSchema,
  KnowledgeBaseCreate_VectorDatabaseSchema,
  KnowledgeBaseCreateSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { getRandomAnimalName } from 'utils/name.utils';

// Prefix to explicitly mark regex patterns in the backend
export const REGEX_PREFIX = 'regex:';

// Helper functions to handle regex pattern marking
export const isRegexPattern = (str: string): boolean => str.startsWith(REGEX_PREFIX);

export const markAsRegexPattern = (pattern: string): string => {
  // Don't double-prefix
  if (pattern.startsWith(REGEX_PREFIX)) {
    return pattern;
  }
  return `${REGEX_PREFIX}${pattern}`;
};

export const stripRegexPrefix = (str: string): string => {
  if (str.startsWith(REGEX_PREFIX)) {
    return str.slice(REGEX_PREFIX.length);
  }
  return str;
};

// Tag validation pattern - matches proto validation: ^([\p{L}\p{Z}\p{N}_.:/=+\-@]*)$
// Allows letters, spaces, numbers, and special characters: _.:/=+-@
const TAG_VALIDATION_PATTERN = /^([\p{L}\p{Z}\p{N}_.:/=+\-@]*)$/u;

// Form values type: Plain object for form state (doesn't extend proto types to avoid TS issues)
export type KnowledgeBaseCreateFormValues = {
  // Basic Information
  displayName: string;
  description?: string;
  tagsArray: Array<{ key: string; value: string }>;

  // Vector Database flat fields
  postgresDsn: string;
  postgresTable: string;

  // Embedding Generator
  embeddingProvider: 'openai' | 'cohere';
  embeddingModel: string;
  embeddingDimensions: number;
  openaiApiKey: string;
  cohereApiKey: string;

  // Indexer
  chunkSize: number;
  chunkOverlap: number;
  exactTopics: string[];
  regexPatterns: string[];
  redpandaUsername: string;
  redpandaPassword: string;
  redpandaSaslMechanism: SASLMechanism;

  // Retriever
  rerankerEnabled: boolean;
  rerankerModel: string;
  rerankerApiKey: string;

  // Generation
  generationModel: string;
};

/**
 * Custom validation function for cross-field logic not covered by proto validation
 */
export function validateFormValues(values: KnowledgeBaseCreateFormValues): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  // Chunk overlap must be less than chunk size
  if (values.chunkOverlap !== undefined && values.chunkSize !== undefined && values.chunkOverlap >= values.chunkSize) {
    errors.chunkOverlap = 'Chunk overlap must be less than chunk size';
  }

  // At least one exact topic OR regex pattern required
  const hasExactTopics = values.exactTopics.some((t) => t && t.trim() !== '');
  const hasRegexPatterns = values.regexPatterns.some((p) => p && p.trim() !== '');

  if (!(hasExactTopics || hasRegexPatterns)) {
    const errorMessage = 'At least one exact topic or regex pattern is required';
    errors.exactTopics = errorMessage;
    errors.regexPatterns = errorMessage;
  }

  // Validate regex patterns
  for (const pattern of values.regexPatterns) {
    if (pattern && pattern.trim() !== '') {
      try {
        new RegExp(pattern);
      } catch (error) {
        errors.regexPatterns = `Invalid regex pattern "${pattern}": ${(error as Error).message}`;
        break;
      }
    }
  }

  // Tag validation - ensure keys and values match expected pattern
  console.log('Custom tag validation running for tagsArray:', values.tagsArray);
  for (const tag of values.tagsArray) {
    // Only validate non-empty tags
    if (tag.key || tag.value) {
      console.log(`Validating tag: key="${tag.key}", value="${tag.value}"`);

      // If either key or value is provided, both must be provided
      if (!tag.key && tag.value) {
        errors.tagsArray = 'Tag key is required when value is provided';
        console.log('Tag validation error: key missing');
        break;
      }
      if (tag.key && !tag.value) {
        errors.tagsArray = 'Tag value is required when key is provided';
        console.log('Tag validation error: value missing');
        break;
      }

      // Validate key pattern
      const keyMatches = tag.key && TAG_VALIDATION_PATTERN.test(tag.key);
      console.log(`Key "${tag.key}" matches pattern: ${keyMatches}`);
      if (tag.key && !keyMatches) {
        errors.tagsArray = `Invalid tag key "${tag.key}". Only letters, numbers, spaces, and these characters are allowed: _.:/=+-@`;
        break;
      }

      // Validate value pattern
      const valueMatches = tag.value && TAG_VALIDATION_PATTERN.test(tag.value);
      console.log(`Value "${tag.value}" matches pattern: ${valueMatches}`);
      if (tag.value && !valueMatches) {
        errors.tagsArray = `Invalid tag value "${tag.value}". Only letters, numbers, spaces, and these characters are allowed: _.:/=+-@`;
        break;
      }
    }
  }
  console.log('Custom tag validation complete. Errors:', errors.tagsArray || 'none');

  // Provider-specific API key validation for embeddings
  if (values.embeddingProvider === 'cohere' && !values.cohereApiKey) {
    errors.cohereApiKey = 'Cohere API Key is required';
  }

  // Reranker validation when enabled
  if (values.rerankerEnabled) {
    if (!values.rerankerModel || values.rerankerModel.trim() === '') {
      errors.rerankerModel = 'Reranker model is required';
    }

    if (!values.rerankerApiKey) {
      errors.rerankerApiKey = 'Reranker API Key is required';
    }
  }

  // OpenAI API key validation (required for embeddings and generation)
  if (!values.openaiApiKey) {
    errors.openaiApiKey = 'OpenAI API Key is required for embeddings and generation';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// Initial form values with auto-generated names
const defaultName = getRandomAnimalName();
const defaultTableName = defaultName.replace(/-/g, '_');

export const initialValues: KnowledgeBaseCreateFormValues = {
  displayName: defaultName,
  description: '',
  tagsArray: [],
  postgresDsn: '',
  postgresTable: defaultTableName,
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  embeddingDimensions: 768,
  openaiApiKey: '',
  cohereApiKey: '',
  chunkSize: 768,
  chunkOverlap: 100,
  exactTopics: [],
  regexPatterns: [],
  redpandaUsername: '',
  redpandaPassword: '',
  redpandaSaslMechanism: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256,
  rerankerEnabled: false,
  rerankerModel: 'rerank-v3.5',
  rerankerApiKey: '',
  generationModel: 'gpt-5',
};

/**
 * Build proto message from form values
 *
 * Converts flat form values to nested proto message structure
 */
export function buildKnowledgeBaseCreate(values: KnowledgeBaseCreateFormValues): KnowledgeBaseCreate {
  // Convert tagsArray to tags map
  console.log('Building proto: tagsArray from form values:', values.tagsArray);
  const tagsMap: Record<string, string> = {};
  for (const tag of values.tagsArray) {
    if (tag.key && tag.value) {
      console.log(`Adding tag to map: "${tag.key}" = "${tag.value}"`);
      tagsMap[tag.key] = tag.value;
    }
  }
  console.log('Final tagsMap for proto:', tagsMap);

  // Merge UI helpers (exactTopics and regexPatterns) into inputTopics
  const inputTopics = [
    ...values.exactTopics.filter((topic) => topic && topic.trim() !== ''),
    ...values.regexPatterns
      .filter((pattern) => pattern && pattern.trim() !== '')
      .map((pattern) => markAsRegexPattern(pattern)),
  ];

  // Wrap API keys and secret refs in ${secrets.} format if they don't already have it
  const wrapSecretRef = (secretName: string): string => {
    if (!secretName) return '';
    if (secretName.startsWith('${secrets.')) return secretName;
    return `\${secrets.${secretName}}`;
  };

  // Update vector database with flat fields
  const vectorDatabase = create(KnowledgeBaseCreate_VectorDatabaseSchema, {
    vectorDatabase: {
      case: 'postgres',
      value: create(KnowledgeBaseCreate_VectorDatabase_PostgresSchema, {
        dsn: wrapSecretRef(values.postgresDsn),
        table: values.postgresTable || '',
      }),
    },
  });

  const generatorProvider = create(KnowledgeBaseCreate_EmbeddingGenerator_ProviderSchema, {
    provider:
      values.embeddingProvider === 'openai'
        ? {
            case: 'openai',
            value: create(KnowledgeBaseCreate_EmbeddingGenerator_Provider_OpenAISchema, {
              apiKey: wrapSecretRef(values.openaiApiKey),
            }),
          }
        : {
            case: 'cohere',
            value: create(KnowledgeBaseCreate_EmbeddingGenerator_Provider_CohereSchema, {
              apiKey: wrapSecretRef(values.cohereApiKey),
            }),
          },
  });

  const embeddingGenerator = create(KnowledgeBaseCreate_EmbeddingGeneratorSchema, {
    provider: generatorProvider,
    dimensions: values.embeddingDimensions,
    model: values.embeddingModel,
  });

  // Create indexer with merged inputTopics
  const indexer = create(KnowledgeBaseCreate_IndexerSchema, {
    chunkSize: values.chunkSize,
    chunkOverlap: values.chunkOverlap,
    inputTopics,
    redpandaUsername: values.redpandaUsername || '',
    redpandaPassword: wrapSecretRef(values.redpandaPassword),
    redpandaSaslMechanism: values.redpandaSaslMechanism,
  });

  // Create retriever with rerankerApiKey if enabled
  let retriever: ReturnType<typeof create<typeof KnowledgeBaseCreate_RetrieverSchema>> | undefined;
  if (values.rerankerEnabled && values.rerankerApiKey) {
    const rerankerProvider = create(KnowledgeBaseCreate_Retriever_Reranker_ProviderSchema, {
      provider: {
        case: 'cohere',
        value: create(KnowledgeBaseCreate_Retriever_Reranker_Provider_CohereSchema, {
          apiKey: wrapSecretRef(values.rerankerApiKey),
          model: values.rerankerModel,
        }),
      },
    });

    retriever = create(KnowledgeBaseCreate_RetrieverSchema, {
      reranker: create(KnowledgeBaseCreate_Retriever_RerankerSchema, {
        enabled: values.rerankerEnabled,
        provider: rerankerProvider,
      }),
    });
  }

  // Create generation with openaiApiKey
  const generationProvider = create(KnowledgeBaseCreate_Generation_ProviderSchema, {
    provider: {
      case: 'openai',
      value: create(KnowledgeBaseCreate_Generation_Provider_OpenAISchema, {
        apiKey: wrapSecretRef(values.openaiApiKey),
      }),
    },
  });

  const generation = create(KnowledgeBaseCreate_GenerationSchema, {
    provider: generationProvider,
    model: values.generationModel,
  });

  // Create the main knowledge base object
  return create(KnowledgeBaseCreateSchema, {
    displayName: values.displayName,
    description: values.description || '',
    tags: tagsMap,
    vectorDatabase,
    embeddingGenerator,
    indexer,
    generation,
    ...(retriever ? { retriever } : {}),
  });
}
