import { z } from 'zod';
import type { ConnectComponentType } from './rpcn-schema';

export type ConnectTilesFormData = {
  connectionName?: string;
  connectionType?: ConnectComponentType;
};

export interface StepSubmissionResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface BaseStepRef {
  triggerSubmit: () => Promise<StepSubmissionResult>;
  isLoading: boolean;
}

export const retentionSizeUnits = ['default', 'infinite', 'Bit', 'KiB', 'MiB', 'GiB', 'TiB'] as const;
export const retentionTimeUnits = [
  'default',
  'infinite',
  'ms',
  'seconds',
  'minutes',
  'hours',
  'days',
  'months',
  'years',
] as const;

export const addTopicFormSchema = z.object({
  topicName: z
    .string()
    .min(1, { message: 'Topic name is required.' })
    .regex(/^[a-zA-Z0-9._@-]+$/, {
      message:
        'Must not contain any whitespace. Must be alphanumeric and can contain underscores, periods, and hyphens.',
    }),
  partitions: z.number().min(1, { message: 'Partitions must be at least 1.' }),
  replicationFactor: z.number().min(1, { message: 'Replication factor must be at least 1.' }).readonly(),
  retentionTimeMs: z.number().min(0, { message: 'Retention time must be at least 0.' }),
  retentionTimeUnit: z.enum(retentionTimeUnits),
  retentionSize: z.number().min(0, { message: 'Retention size must be at least 0.' }),
  retentionSizeUnit: z.enum(retentionSizeUnits),
});

export type AddTopicFormData = z.infer<typeof addTopicFormSchema>;

export const saslMechanisms = ['SCRAM-SHA-256', 'SCRAM-SHA-512'] as const;
export type SaslMechanism = (typeof saslMechanisms)[number];

export const addUserFormSchema = z.object({
  username: z
    .string()
    .min(1, { message: 'Username is required.' })
    .regex(/^[a-zA-Z0-9._@-]+$/, {
      message: 'Must not contain any whitespace. Dots, hyphens and underscores may be used.',
    }),
  password: z
    .string()
    .min(4, { message: 'Password must be at least 4 characters.' })
    .max(64, { message: 'Password must not exceed 64 characters.' }),
  saslMechanism: z.enum(saslMechanisms),
  superuser: z.boolean().default(true),
  specialCharactersEnabled: z.boolean().default(false),
  passwordLength: z.number().min(4).max(64).default(30),
});

export type AddUserFormData = z.infer<typeof addUserFormSchema>;
