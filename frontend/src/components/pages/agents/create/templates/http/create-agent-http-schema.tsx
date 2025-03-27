import { formOptions } from '@tanstack/react-form';
import { z } from 'zod';

/**
 * @see https://gist.github.com/magnetikonline/073afe7909ffdd6f10ef06a00bc3bc88#github-token-validation-regular-expressions
 */
const personalAccessTokenSchema = z.string().refine(
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

export const createAgentHttpSchema = z
  .object({
    name: z.string().min(1, 'Agent name is required'),
    description: z.string(),
    TOPIC: z.string().min(1, 'Source topic is required'),
    OPENAI_KEY: z.string().min(1, 'OpenAI API credential is required'),
    POSTGRES_DSN: z.string().min(1, 'Postgres Connection URI is required'),
    USERNAME: z.string().min(1, 'Username is required'),
    KAFKA_PASSWORD: z.string().min(1, 'Password is required'),
    SASL_MECHANISM: z.enum(['SCRAM-SHA-256', 'SCRAM-SHA-512']),
    REPOSITORY_URL: z.string().min(1, 'Repository URL is required').url('Invalid repository URL'),
    REPOSITORY_BRANCH: z.string(),
    isPrivateRepository: z.boolean(),
    GLOB_PATTERN: z
      .string()
      .min(1, 'Glob pattern is required')
      .regex(/^[*?[\]{}()|!@#$%^&\w./,-]+$/, 'Invalid glob pattern. Use patterns like "**", "**/*.js", or "src/**/*"'),
    PERSONAL_ACCESS_TOKEN: z.string(),
    // PERSONAL_ACCESS_TOKEN: personalAccessTokenSchema,
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

export const createAgentHttpFormOpts = formOptions({
  defaultValues: {
    name: '',
    description: '',
    TOPIC: '',
    OPENAI_KEY: '',
    POSTGRES_DSN: '',
    USERNAME: '',
    KAFKA_PASSWORD: '',
    SASL_MECHANISM: 'SCRAM-SHA-256',
    REPOSITORY_URL: '',
    REPOSITORY_BRANCH: 'main',
    isPrivateRepository: false,
    GLOB_PATTERN: '**',
    PERSONAL_ACCESS_TOKEN: '',
  },
});
