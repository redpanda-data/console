import { z } from 'zod';

// Regex for validating secret ID format (uppercase letters, numbers, underscores, starting with letter)
const SECRET_ID_REGEX = /^[A-Z][A-Z0-9_]*$/;

export const secretSchema = (customValueSchema?: z.ZodTypeAny) =>
  z.object({
    id: z
      .string()
      .min(1, 'ID is required')
      .regex(SECRET_ID_REGEX, 'ID must use uppercase letters, numbers, and underscores only, starting with a letter'),
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
