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

/**
 * Shared user utilities for SASL mechanisms and validation
 * Used by both UserCreate and add-user-step
 */

import { CreateUserRequest_UserSchema } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { getStringFieldConstraints } from 'utils/proto-constraints';

export const SASL_MECHANISMS = ['SCRAM-SHA-256', 'SCRAM-SHA-512'] as const;
export type SaslMechanism = (typeof SASL_MECHANISMS)[number];

export const USERNAME_REGEX = /^[a-zA-Z0-9._@-]+$/;
export const USERNAME_ERROR_MESSAGE =
  'Must not contain any whitespace. Must be alphanumeric and can contain underscores, periods, at symbols, and hyphens.';

/** Derived at runtime from proto CreateUserRequest.User field constraints. */
const nameConstraints = getStringFieldConstraints(CreateUserRequest_UserSchema, 'name');
const passwordConstraints = getStringFieldConstraints(CreateUserRequest_UserSchema, 'password');

export const USERNAME_MAX_LENGTH = nameConstraints?.maxLen ?? 128;
export const PASSWORD_MIN_LENGTH = passwordConstraints?.minLen ?? 3;
export const PASSWORD_MAX_LENGTH = passwordConstraints?.maxLen ?? 128;

export function validateUsername(username: string): boolean {
  return username.length > 0 && username.length <= USERNAME_MAX_LENGTH && USERNAME_REGEX.test(username);
}

export function validatePassword(password: string): boolean {
  return Boolean(password) && password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
}

export function generatePassword(length: number, allowSpecialChars: boolean): string {
  if (length <= 0) {
    return '';
  }

  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = lowercase.toUpperCase();
  const numbers = '0123456789';
  const special = '.,&_+|[]/-()';

  let alphabet = lowercase + uppercase + numbers;
  if (allowSpecialChars) {
    alphabet += special;
  }

  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);

  let result = '';
  for (const n of randomValues) {
    const index = n % alphabet.length;
    const sym = alphabet[index];

    result += sym;
  }

  return result;
}
