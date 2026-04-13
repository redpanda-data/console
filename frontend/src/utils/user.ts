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

import { SASLMechanism } from 'protogen/redpanda/api/dataplane/v1/user_pb';

/**
 * Shared user utilities for SASL mechanisms and validation
 * Used by both UserCreate and add-user-step
 */

export { SASLMechanism };

export const SASL_MECHANISMS = [
  SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256,
  SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512,
] as const;

export const SASL_MECHANISM_OPTIONS: ReadonlyArray<{ id: SASLMechanism; name: string; description: string }> = [
  {
    id: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256,
    name: 'SCRAM-SHA-256',
    description: 'Salted Challenge Response with SHA-256',
  },
  {
    id: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512,
    name: 'SCRAM-SHA-512',
    description: 'Salted Challenge Response with SHA-512 (recommended)',
  },
];

export const USERNAME_REGEX = /^[a-zA-Z0-9._@-]+$/;
export const USERNAME_ERROR_MESSAGE =
  'Must not contain any whitespace. Must be alphanumeric and can contain underscores, periods, and hyphens.';

export const PASSWORD_MIN_LENGTH = 4;
export const PASSWORD_MAX_LENGTH = 64;

export function validateUsername(username: string): boolean {
  return USERNAME_REGEX.test(username);
}

export function validatePassword(password: string): boolean {
  return Boolean(password) && password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
}

export function generatePassword(length: number, includeSpecial: boolean): string {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  let chars = lowercase + uppercase + numbers;
  if (includeSpecial) {
    chars += special;
  }
  let pwd = '';
  for (let i = 0; i < length; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}
