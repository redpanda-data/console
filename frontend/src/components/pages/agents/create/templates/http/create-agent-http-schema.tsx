import { z } from 'zod';

export const createAgentHttpSchema = z.object({
  name: z.string().min(3, 'Agent name must be at least 3 characters'),
  description: z.string().optional(),
  sourceTopic: z.string().min(1, 'Source topic is required'),
  openaiApiCredential: z.string().min(1, 'OpenAI API credential is required'),
  postgresConnectionUri: z.string().min(1, 'Postgres Connection URI is required'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  saslMechanism: z.enum(['SCRAM-SHA-256', 'SCRAM-SHA-512']),
});
