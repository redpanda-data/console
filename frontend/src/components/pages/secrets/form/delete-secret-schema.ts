import { z } from 'zod';

export const deleteSecretSchema = (secretId: string) =>
  z.object({
    id: z.string(),
    confirmationText: z.string().refine((text) => text.toUpperCase() === secretId.toUpperCase(), {
      message: `Text must match "${secretId}"`,
    }),
  });
