import { z } from 'zod';

export const createAgentHttpSchema = z.object({
  name: z.string().min(3, 'Agent name must be at least 3 characters'),
  description: z.string().optional(),
  TOPIC: z.string().min(1, 'Source topic is required'),
  OPENAI_KEY: z.string().min(1, 'OpenAI API credential is required'),
  POSTGRES_DSN: z.string().min(1, 'Postgres Connection URI is required'),
  USERNAME: z.string().min(1, 'Username is required'),
  KAFKA_PASSWORD: z.string().min(1, 'Password is required'),
  SASL_MECHANISM: z.enum(['SCRAM-SHA-256', 'SCRAM-SHA-512']),
});
