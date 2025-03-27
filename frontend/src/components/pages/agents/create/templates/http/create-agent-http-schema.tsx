import { formOptions } from '@tanstack/react-form';
import { z } from 'zod';

export const createAgentHttpSchema = z.object({
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
  GLOB_PATTERN: z
    .string()
    .min(1, 'Glob pattern is required')
    .regex(/^[*?[\]{}()|!@#$%^&\w./,-]+$/, 'Invalid glob pattern. Use patterns like "**", "**/*.js", or "src/**/*"'),
});

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
    GLOB_PATTERN: '**',
  },
});
