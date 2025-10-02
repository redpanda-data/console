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

export const SASL_MECHANISMS = ['SCRAM-SHA-256', 'SCRAM-SHA-512'] as const;
export type SaslMechanism = (typeof SASL_MECHANISMS)[number];

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
