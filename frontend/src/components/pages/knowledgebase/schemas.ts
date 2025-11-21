import { SASLMechanism } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { z } from 'zod';

// Tag schema matching proto validation rules
export const TagSchema = z.object({
  key: z.string().trim().min(0).max(64, { message: 'Key must be at most 64 characters' }),
  value: z
    .string()
    .trim()
    .min(0)
    .max(256, { message: 'Value must be at most 256 characters' })
    .regex(/^([\p{L}\p{Z}\p{N}_.:/=+\-@]*)$/u, {
      message: 'Value contains invalid characters. Allowed: letters, numbers, spaces, and _.:/=+-@',
    }),
});

// Form schema for knowledge base creation
export const KnowledgeBaseCreateFormSchema = z
  .object({
    // Basic Information
    displayName: z.string().min(1, 'Display name is required').max(128, 'Display name must be at most 128 characters'),
    description: z.string().max(512, 'Description must be at most 512 characters').optional(),
    tags: z
      .array(TagSchema)
      .max(16, 'Maximum 16 tags allowed')
      .refine(
        (arr) => {
          const keys = arr.map((t) => t.key.trim()).filter((k) => k.length > 0);
          return keys.length === new Set(keys).size;
        },
        { message: 'Tags must have unique keys' }
      )
      .default([]),

    // Vector Database (PostgreSQL only for now)
    vectorDatabaseType: z.literal('postgres').default('postgres'),
    postgresDsn: z.string().min(1, 'PostgreSQL DSN is required'),
    postgresTable: z
      .string()
      .min(1, 'PostgreSQL table name is required')
      .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, {
        message: 'Table name must start with a letter and contain only letters, numbers, and underscores',
      }),

    // Embedding Generator
    embeddingProvider: z.enum(['openai', 'cohere']).default('openai'),
    embeddingModel: z.string().min(1, 'Embedding model is required'),
    embeddingDimensions: z.number().min(1, 'Embedding dimensions must be greater than 0').default(768),

    // Provider-specific API keys
    openaiApiKey: z.string().optional(),
    cohereApiKey: z.string().optional(),

    // Indexer
    chunkSize: z.number().min(1, 'Chunk size must be greater than 0').default(512),
    chunkOverlap: z.number().min(0, 'Chunk overlap cannot be negative').default(100),
    inputTopics: z.array(z.string()).min(1, 'At least one input topic is required'),

    // Redpanda Credentials
    credentialChoice: z.enum(['auto', 'manual']).default('manual'),
    redpandaUsername: z.string().optional(),
    redpandaPassword: z.string().optional(),
    redpandaSaslMechanism: z.nativeEnum(SASLMechanism).default(SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256),

    // Reranker (optional)
    rerankerEnabled: z.boolean().default(true),
    rerankerModel: z.string().optional(),
    rerankerApiKey: z.string().optional(),

    // Generation (mandatory)
    generationProvider: z.literal('openai').default('openai'),
    generationModel: z.string().min(1, 'Generation model is required'),
  })
  .superRefine((data, ctx) => {
    // Validate chunk overlap is less than chunk size
    if (data.chunkOverlap >= data.chunkSize) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Chunk overlap must be less than chunk size',
        path: ['chunkOverlap'],
      });
    }

    // Validate provider-specific API keys
    if (data.embeddingProvider === 'openai' && !data.openaiApiKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'OpenAI API Key is required',
        path: ['openaiApiKey'],
      });
    }

    if (data.embeddingProvider === 'cohere' && !data.cohereApiKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cohere API Key is required',
        path: ['cohereApiKey'],
      });
    }

    // Validate credentials based on choice
    if (data.credentialChoice === 'manual') {
      if (!data.redpandaUsername || data.redpandaUsername.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Redpanda username is required',
          path: ['redpandaUsername'],
        });
      }

      if (!data.redpandaPassword || data.redpandaPassword.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Redpanda password is required',
          path: ['redpandaPassword'],
        });
      }
    }

    // For auto-generated credentials, ensure they are populated
    if (data.credentialChoice === 'auto') {
      if (!data.redpandaUsername || data.redpandaUsername.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Auto-generated username is required',
          path: ['redpandaUsername'],
        });
      }

      if (!data.redpandaPassword || data.redpandaPassword.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Auto-generated password is required',
          path: ['redpandaPassword'],
        });
      }
    }

    // Validate reranker fields when enabled
    if (data.rerankerEnabled) {
      if (!data.rerankerModel || data.rerankerModel.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Reranker model is required',
          path: ['rerankerModel'],
        });
      }

      if (!data.rerankerApiKey || data.rerankerApiKey.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Reranker API Key is required',
          path: ['rerankerApiKey'],
        });
      }
    }

    // Validate that OpenAI API key is provided when using OpenAI for generation
    if (data.generationProvider === 'openai' && !data.openaiApiKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'OpenAI API Key is required for generation',
        path: ['openaiApiKey'],
      });
    }
  });

export type KnowledgeBaseCreateFormValues = z.infer<typeof KnowledgeBaseCreateFormSchema>;

// Initial form values
export const initialValues: KnowledgeBaseCreateFormValues = {
  displayName: '',
  description: '',
  tags: [],
  vectorDatabaseType: 'postgres',
  postgresDsn: '',
  postgresTable: '',
  embeddingProvider: 'openai',
  embeddingModel: 'text-embedding-3-small',
  embeddingDimensions: 768,
  openaiApiKey: '',
  cohereApiKey: '',
  chunkSize: 768,
  chunkOverlap: 100,
  inputTopics: [],
  credentialChoice: 'manual',
  redpandaUsername: '',
  redpandaPassword: '',
  redpandaSaslMechanism: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256,
  rerankerEnabled: true,
  rerankerModel: 'rerank-v3.5',
  rerankerApiKey: '',
  generationProvider: 'openai',
  generationModel: 'gpt-5.1',
};
