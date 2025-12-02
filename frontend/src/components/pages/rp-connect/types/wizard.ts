import { enumFromKeys } from 'utils/form';
import { sizeFactors, timeFactors } from 'utils/topic-utils';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SASL_MECHANISMS,
  USERNAME_ERROR_MESSAGE,
  USERNAME_REGEX,
} from 'utils/user';
import { z } from 'zod';

import { CONNECT_COMPONENT_TYPE } from './schema';

export const connectTilesListFormSchema = z.object({
  connectionName: z.string().min(1, { message: 'Please select a connection method.' }),
  connectionType: z.enum(CONNECT_COMPONENT_TYPE),
});

export type ConnectTilesListFormData = z.infer<typeof connectTilesListFormSchema>;

export type OperationResult = {
  operation: string; // e.g., "Create user", "Create ACL", "Create secret"
  success: boolean;
  message?: string;
  error?: string;
};

export type StepSubmissionResult<T> = {
  success: boolean; // Overall success (all operations succeeded)
  message?: string; // Overall summary message
  error?: string; // Overall error message
  data?: T; // Form data
  operations?: OperationResult[]; // Detailed results for each operation
};

export type BaseStepRef<T> = {
  triggerSubmit: () => Promise<StepSubmissionResult<T>>;
  isPending: boolean;
};

// User step-specific submission result
export type UserStepSubmissionResult = {
  success: boolean;
  data?: AddUserFormData;
};

// New ref type for user step
export type UserStepRef = {
  triggerSubmit: () => Promise<UserStepSubmissionResult>;
  isPending: boolean;
};

export const retentionTimeUnits = enumFromKeys(timeFactors);
export const retentionSizeUnits = enumFromKeys(sizeFactors);

export const addTopicFormSchema = z.object({
  topicName: z
    .string()
    .min(1, { message: 'Topic name is required.' })
    .regex(/^[a-zA-Z0-9._@-]+$/, {
      message:
        'Must not contain any whitespace. Must be alphanumeric and can contain underscores, periods, and hyphens.',
    }),
  partitions: z.number().min(1, { message: 'Partitions must be at least 1.' }),
  replicationFactor: z
    .number()
    .min(1, { message: 'Replication factor must be at least 1.' })
    .max(5, { message: 'Replication factor must be less than or equal to 5.' })
    .readonly(),
  retentionTimeMs: z.number().min(0, { message: 'Retention time must be at least 0.' }),
  retentionTimeUnit: z.enum(retentionTimeUnits),
  retentionSize: z.number().min(0, { message: 'Retention size must be at least 0.' }),
  retentionSizeUnit: z.enum(retentionSizeUnits),
});

export type AddTopicFormData = z.infer<typeof addTopicFormSchema>;

export const addUserFormSchema = z.object({
  username: z.string().min(1, { message: 'Username is required.' }).regex(USERNAME_REGEX, {
    message: USERNAME_ERROR_MESSAGE,
  }),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, { message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` })
    .max(PASSWORD_MAX_LENGTH, { message: `Password must not exceed ${PASSWORD_MAX_LENGTH} characters.` }),
  saslMechanism: z.enum(SASL_MECHANISMS),
  superuser: z.boolean().default(true),
  specialCharactersEnabled: z.boolean().default(false),
  passwordLength: z.number().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH).default(30),
  consumerGroup: z.string().optional(),
});

export type AddUserFormData = z.infer<typeof addUserFormSchema>;

const onboardingWizardFormSchema = z.object({
  input: connectTilesListFormSchema.optional(),
  output: connectTilesListFormSchema.optional(),
  topicName: z.optional(addTopicFormSchema.shape.topicName),
  username: z.optional(addUserFormSchema.shape.username),
});

export type OnboardingWizardFormData = z.infer<typeof onboardingWizardFormSchema>;

export type MinimalTopicData = {
  topicName: string;
};

export type MinimalUserData = {
  username: string;
  saslMechanism: (typeof SASL_MECHANISMS)[number];
  consumerGroup: string;
};

export const CreatableSelectionOptions = {
  EXISTING: 'existing',
  CREATE: 'create',
} as const;

export type CreatableSelectionType = (typeof CreatableSelectionOptions)[keyof typeof CreatableSelectionOptions];
