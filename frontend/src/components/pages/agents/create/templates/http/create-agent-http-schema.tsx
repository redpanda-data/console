import { formOptions } from '@tanstack/react-form';
import type { Secret } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { z } from 'zod';

export const USERNAME_DESCRIPTION = 'Username must be alphanumeric with dots, underscores, at symbols, and hyphens.';

export const usernameSchema = z
  .string()
  .describe(USERNAME_DESCRIPTION)
  .min(1, 'Username is required')
  .max(128, 'Username must not exceed 128 characters')
  .regex(
    /^[a-zA-Z0-9._@-]+$/,
    'Username may contain only letters, numbers, dots, underscores, at symbols, and hyphens.',
  );

export const PASSWORD_DESCRIPTION = 'Password must be between 3 and 128 characters long.';

export const passwordSchema = z
  .string()
  .describe(PASSWORD_DESCRIPTION)
  .min(3, 'Password must be at least 3 characters long')
  .max(128, 'Password must not exceed 128 characters');

export const KAFKA_PASSWORD_DESCRIPTION = 'Password for the Redpanda user.';

export const PERSONAL_ACCESS_TOKEN_DESCRIPTION =
  'A GitHub Personal Access Token with access to read repository contents, used to clone and pull private repositories.';

/**
 * @see https://gist.github.com/magnetikonline/073afe7909ffdd6f10ef06a00bc3bc88#github-token-validation-regular-expressions
 */
export const personalAccessTokenSchema = z
  .string()
  .describe(PERSONAL_ACCESS_TOKEN_DESCRIPTION)
  .refine(
    (val) => {
      if (val.length === 0) return true;
      if (val.startsWith('ghp_')) return /^ghp_[a-zA-Z0-9]{36}$/.test(val); // Classic token
      if (val.startsWith('github_pat_')) return /^github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}$/.test(val); // Fine-grained token
      return false;
    },
    (val) => {
      if (val.length === 0) return { message: '' };
      if (val.startsWith('ghp_')) return { message: 'Classic token must be 40 characters with prefix "ghp_"' };
      if (val.startsWith('github_pat_'))
        return { message: 'Fine-grained token must be 93 characters with prefix "github_pat_"' };
      return { message: 'Invalid token format. Must start with "ghp_" or "github_pat_"' };
    },
  );

export const OPEN_AI_API_TOKEN_DESCRIPTION = 'OpenAI API token must use "sk-" prefix and be 20 characters long.';

export const openAiApiTokenSchema = z
  .string()
  .describe(OPEN_AI_API_TOKEN_DESCRIPTION)
  .min(1, 'OpenAI API token is required')
  .regex(
    /^sk-[a-zA-Z0-9_-]+$/,
    'OpenAI API Token must start with "sk-" followed by alphanumeric characters, underscores, or hyphens',
  )
  .min(20, 'OpenAI API token is too short');

export const POSTGRES_CONNECTION_URI_DESCRIPTION =
  'Postgres connection URI must be in the format: postgres://user:password@hostname:port/database';

export const postgresConnectionUriSchema = z
  .string()
  .describe(POSTGRES_CONNECTION_URI_DESCRIPTION)
  .min(1, 'Postgres connection URI is required')
  .regex(
    /^postgres:\/\/(.+):(.+)@([a-zA-Z0-9.-]+):([0-9]+)\/([a-zA-Z0-9_]+)$/,
    'Invalid Postgres Connection URI format. Expected: postgres://user:password@hostname:port/database',
  );

const nameDescriptionPattern = /^([\p{L}\p{Z}\p{N}_.:/=+\-@]*)$/u;

export const AGENT_NAME_DESCRIPTION =
  'A name for your agent. Can include letters, numbers, spaces, and special characters like _.:/=+-@';
export const AGENT_DESCRIPTION_DESCRIPTION =
  'A short description of what this agent does. Useful for documentation and easy identification.';
export const SYSTEM_PROMPT_DESCRIPTION =
  'A system prompt that guides the behavior of the AI assistant. This defines how the assistant should respond to user queries.';

const GLOB_PATTERN_REGEX = /^[a-zA-Z0-9*?[\]{}!@#$%^&()|_+\-./,()]+$/;
export const INCLUDE_GLOB_PATTERN_DESCRIPTION =
  'Define which files to include using glob patterns (e.g., **/*.md, docs/**/*.txt). This helps limit indexing to relevant files.';
export const EXCLUDE_GLOB_PATTERN_DESCRIPTION =
  'Optionally exclude specific files or folders using glob patterns (e.g., **/test/**, README.md).';

export const createAgentHttpSchema = z
  .object({
    name: z
      .string()
      .describe(AGENT_NAME_DESCRIPTION)
      .min(1, 'Agent name is required')
      .regex(nameDescriptionPattern, 'Name can only contain letters, numbers, spaces, and _.:/=+-@'),
    description: z
      .string()
      .describe(AGENT_DESCRIPTION_DESCRIPTION)
      .regex(nameDescriptionPattern, 'Description can only contain letters, numbers, spaces, and _.:/=+-@'),
    SYSTEM_PROMPT: z.string().describe(SYSTEM_PROMPT_DESCRIPTION).min(1, 'System prompt is required'),
    TOPIC: z.string().min(1, 'Redpanda topic is required'),
    OPENAI_KEY: z.string().min(1, 'OpenAI API credential is required'),
    POSTGRES_DSN: z.string().min(1, 'Postgres Connection URI is required'),
    USERNAME: usernameSchema,
    KAFKA_PASSWORD: z.string().min(1, 'Password is required'),
    SASL_MECHANISM: z.enum(['SCRAM-SHA-256', 'SCRAM-SHA-512']),
    REPOSITORY_URL: z
      .string()
      .min(1, 'Repository URL is required')
      .regex(/^https?:\/\/.*\.git$/, 'Repository URL must start with http:// or https:// and end with .git'),
    REPOSITORY_BRANCH: z.string(),
    isPrivateRepository: z.boolean(),
    /**
     * @see https://man7.org/linux/man-pages/man7/glob.7.html
     */
    INCLUDE_GLOB_PATTERN: z
      .string()
      .describe(INCLUDE_GLOB_PATTERN_DESCRIPTION)
      .min(1, 'Include glob pattern is required. Use ** to include all files.')
      .refine(
        (value) => {
          const patterns = value.split(',').map((pattern) => pattern.trim());
          return patterns.every((pattern) => GLOB_PATTERN_REGEX.test(pattern));
        },
        (value) => {
          const patterns = value.split(',').map((pattern) => pattern.trim());
          const invalidPattern = patterns.find((pattern) => !GLOB_PATTERN_REGEX.test(pattern));
          if (invalidPattern) {
            return { message: `Invalid glob pattern: "${invalidPattern}" contains unsupported characters.` };
          }
          return { message: 'Invalid glob pattern.' };
        },
      ),
    EXCLUDE_GLOB_PATTERN: z
      .string()
      .describe(EXCLUDE_GLOB_PATTERN_DESCRIPTION)
      .refine(
        (value) => {
          if (!value || value === '') return true;
          const patterns = value.split(',').map((pattern) => pattern.trim());
          return patterns.every((pattern) => GLOB_PATTERN_REGEX.test(pattern));
        },
        (value) => {
          if (!value || value === '') return { message: '' };
          const patterns = value.split(',').map((pattern) => pattern.trim());
          const invalidPattern = patterns.find((pattern) => !GLOB_PATTERN_REGEX.test(pattern));
          if (invalidPattern) {
            return { message: `Invalid glob pattern: "${invalidPattern}" contains unsupported characters.` };
          }
          return { message: 'Invalid glob pattern.' };
        },
      ),
    PERSONAL_ACCESS_TOKEN: z.string(),
  })
  .refine(
    (data) => {
      if (data.isPrivateRepository) {
        return data.PERSONAL_ACCESS_TOKEN.length > 0;
      }
      return true;
    },
    {
      message: 'Personal access token is required for private repositories',
      path: ['PERSONAL_ACCESS_TOKEN'], // Path to the field that will receive the error
    },
  );

export const createAgentHttpFormOpts = (secretList?: (Secret | undefined)[]) =>
  formOptions({
    defaultValues: {
      name: '',
      description: '',
      SYSTEM_PROMPT: `You are a helpful question answering AI agent.
You answer questions and have available a tool to search
a document store for semantically relevant content to answer questions.`,
      TOPIC: '',
      OPENAI_KEY: secretList?.find((secret) => secret?.id.toLowerCase().includes('openai'))?.id ?? '',
      POSTGRES_DSN: secretList?.find((secret) => secret?.id.toLowerCase().includes('postgres'))?.id ?? '',
      USERNAME: secretList?.find((secret) => secret?.id.toLowerCase().includes('username'))?.id ?? '',
      KAFKA_PASSWORD: secretList?.find((secret) => secret?.id.toLowerCase().includes('password'))?.id ?? '',
      SASL_MECHANISM: 'SCRAM-SHA-256',
      REPOSITORY_URL: '',
      REPOSITORY_BRANCH: 'main',
      isPrivateRepository: false,
      INCLUDE_GLOB_PATTERN: '**/*.md,**/*.adoc',
      EXCLUDE_GLOB_PATTERN: '',
      PERSONAL_ACCESS_TOKEN: secretList?.find((secret) => secret?.id.toLowerCase().includes('personal'))?.id ?? '',
    },
  });

export type CreateAgentHttpFormValues = ReturnType<typeof createAgentHttpFormOpts>['defaultValues'];
