/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { z } from 'zod';

import { createLabelsSchema, SECRET_ID_REGEX } from '../secret-form-shared';

export const SecretUpdateFormSchema = z.object({
  id: z
    .string()
    .min(1, 'ID is required')
    .regex(SECRET_ID_REGEX, 'ID must contain only letters, numbers, slashes, underscores, and hyphens'),
  value: z.string().optional(),
  scopes: z.array(z.number()).min(1, 'At least one scope is required'),
  labels: createLabelsSchema(),
});

export type SecretUpdateFormValues = z.infer<typeof SecretUpdateFormSchema>;
