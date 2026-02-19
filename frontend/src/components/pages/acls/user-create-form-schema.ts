/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { CreateUserRequest_UserSchema } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { protoToZodSchema } from 'utils/proto-constraints';
import { SASL_MECHANISMS, USERNAME_ERROR_MESSAGE, USERNAME_REGEX } from 'utils/user';
import { z } from 'zod';

/**
 * Base schema derived from proto CreateUserRequest.User constraints:
 * - name: string, min_len=1, max_len=128
 * - password: string, min_len=3, max_len=128
 * - mechanism: enum (numeric)
 */
const protoSchema = protoToZodSchema(CreateUserRequest_UserSchema);

export const createUserFormSchema = (existingUsers: string[]) =>
  z.object({
    // Proto provides min(1) + max(128), we add regex and uniqueness check
    username: (protoSchema.shape.name as z.ZodString)
      .regex(USERNAME_REGEX, USERNAME_ERROR_MESSAGE)
      .refine((val) => !existingUsers.includes(val), 'User already exists'),
    // Proto provides min(3) + max(128)
    password: protoSchema.shape.password as z.ZodString,
    // Keep as string enum for form UX (proto uses numeric enum)
    mechanism: z.enum(SASL_MECHANISMS),
    // Not in proto — frontend-only field for role assignment
    roles: z.array(z.string()).default([]),
  });

export type UserCreateFormValues = z.infer<ReturnType<typeof createUserFormSchema>>;

export const initialValues: UserCreateFormValues = {
  username: '',
  password: '',
  mechanism: 'SCRAM-SHA-256',
  roles: [],
};
