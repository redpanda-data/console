import z from 'zod';

// Zod schema for tags - matching proto validation rules
export const TagSchema = z.object({
  key: z.string().trim().min(0).max(64, { message: 'Key must be at most 64 characters' }),
  value: z
    .string()
    .trim()
    .min(0)
    .max(256, { message: 'Value must be at most 256 characters' })
    .regex(/^([\p{L}\p{Z}\p{N}_.:/=+\-@]*)$/u, {
      message: 'Value contains invalid characters. Allowed: letters, numbers, spaces, and _.:/=+-@',
    }),
});

// Form schema - matching proto validation rules
export const FormSchema = z.object({
  displayName: z
    .string()
    .min(3, 'Agent name must be at least 3 characters')
    .max(128, 'Agent name must be at most 128 characters')
    .regex(/^[A-Za-z0-9-_ /]+$/, {
      message: 'Agent name can only contain letters, numbers, spaces, hyphens, underscores, and forward slashes',
    }),
  description: z.string().max(256, 'Description must be at most 256 characters').optional(),
  tags: z
    .array(TagSchema)
    .max(16, 'Maximum 16 tags allowed')
    .refine(
      (arr) => {
        const keys = arr.map((t) => t.key.trim()).filter((k) => k.length > 0);
        return keys.length === new Set(keys).size;
      },
      { message: 'Tags must have unique keys' }
    ),
  triggerType: z.enum(['http', 'slack', 'kafka']).default('http'),
  provider: z.enum(['openai', 'anthropic', 'google', 'openaiCompatible']).default('openai'),
  apiKeySecret: z.string().min(1, 'API Token is required'),
  model: z.string().min(1, 'Model is required'),
  baseUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  maxIterations: z
    .number()
    .min(10, 'Max iterations must be at least 10')
    .max(100, 'Max iterations must be at most 100')
    .default(30),
  individualTools: z.array(z.string()).default([]),
  selectedMcpServers: z.array(z.string()),
  resourcesTier: z.string().default('Small'),
  systemPrompt: z.string().min(10, 'System prompt must be at least 10 characters'),
  serviceAccountName: z
    .string()
    .min(3, 'Service account name must be at least 3 characters')
    .max(128, 'Service account name must be at most 128 characters')
    .regex(/^[^<>]+$/, 'Service account name cannot contain < or > characters'),
}).superRefine((data, ctx) => {
  if (data.provider === 'openaiCompatible') {
    if (!data.baseUrl || data.baseUrl.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Base URL is required for OpenAI-compatible provider',
        path: ['baseUrl'],
      });
    } else {
      try {
        new URL(data.baseUrl);
        if (!data.baseUrl.startsWith('http://') && !data.baseUrl.startsWith('https://')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Base URL must start with http:// or https://',
            path: ['baseUrl'],
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Must be a valid URL',
          path: ['baseUrl'],
        });
      }
    }
  }
});

export type FormValues = z.infer<typeof FormSchema>;

// Initial form values
export const initialValues: FormValues = {
  displayName: '',
  description: '',
  tags: [],
  triggerType: 'http',
  provider: 'openai',
  apiKeySecret: '',
  model: 'gpt-5',
  baseUrl: '',
  maxIterations: 30,
  individualTools: [],
  selectedMcpServers: [],
  resourcesTier: 'XSmall',
  systemPrompt: '',
  serviceAccountName: '',
};
