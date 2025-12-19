/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License,
 * use of this software will be governed by the Apache License, Version 2.0
 */

import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { z } from 'zod';

import { createLabelsSchema, SECRET_ID_REGEX } from '../secret-form-shared';

export const SecretCreateFormSchema = z.object({
  id: z
    .string()
    .min(1, 'ID is required')
    .regex(SECRET_ID_REGEX, 'ID must contain only letters, numbers, slashes, underscores, and hyphens'),
  value: z.string().min(1, 'Value is required'),
  scopes: z.array(z.number()).min(1, 'At least one scope is required'),
  labels: createLabelsSchema(),
});

export type SecretCreateFormValues = z.infer<typeof SecretCreateFormSchema>;

export const initialValues: SecretCreateFormValues = {
  id: '',
  value: '',
  scopes: [Scope.AI_GATEWAY, Scope.MCP_SERVER, Scope.AI_AGENT, Scope.REDPANDA_CONNECT, Scope.REDPANDA_CLUSTER],
  labels: [],
};
