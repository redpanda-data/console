import { z } from 'zod';

export const secretSchema = (customValueSchema?: z.ZodTypeAny) =>
  z.object({
    id: z
      .string()
      .min(1, 'ID is required')
      .regex(
        /^[A-Z][A-Z0-9_]*$/,
        'ID must use uppercase letters, numbers, and underscores only, starting with a letter',
      ),
    value: customValueSchema ? customValueSchema : z.string().min(1, 'Value is required'),
    labels: z
      .array(
        z.object({
          key: z.string(),
          value: z.string(),
        }),
      )
      .optional()
      .default([])
      .refine((labels) => {
        // Only validate non-empty labels - if both key and value are empty, that's fine
        return labels.every((label) => {
          return (label.key === '' && label.value === '') || (label.key !== '' && label.value !== '');
        });
      }, 'Both key and value must be provided for a label'),
  });
