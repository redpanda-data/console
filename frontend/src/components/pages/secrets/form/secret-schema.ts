import { z } from 'zod';

// Regex for validating secret ID format
// This can be either through the UI (uppercase with underscores) or through kafka connect (lower with slashes and dashes)
const SECRET_ID_REGEX = /^[a-zA-Z0-9/_-]+$/;

export const secretSchema = (customValueSchema?: z.ZodTypeAny) =>
  z.object({
    id: z
      .string()
      .min(1, 'ID is required')
      .regex(SECRET_ID_REGEX, 'ID must contain only letters, numbers, slashes, underscores, and hyphens'),
    value: customValueSchema ? customValueSchema : z.string().min(1, 'Value is required'),
    labels: z
      .array(
        z.object({
          key: z.string(),
          value: z.string(),
        })
      )
      .optional()
      .default([])
      .refine((labels) => {
        // Only validate non-empty labels - if both key and value are empty, that's fine
        return labels.every(
          (label) => (label.key === '' && label.value === '') || (label.key !== '' && label.value !== '')
        );
      }, 'Both key and value must be provided for a label'),
    scopes: z.array(z.number()).min(1, 'At least one scope is required'),
  });
