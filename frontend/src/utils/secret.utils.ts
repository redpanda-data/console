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

import { ALPHANUMERIC_WITH_HYPHENS } from './regex';

/**
 * Regex to remove trailing underscores from secret IDs
 */
const TRAILING_UNDERSCORES_REGEX = /_+$/;

/**
 * Coerces a string to the secret-ID pattern `^[A-Z][A-Z0-9_]*$`: upper-cased, non-alphanumerics
 * collapsed to single underscores, trailing underscores dropped. `test@#$agent` -> `TEST_AGENT`.
 */
export function sanitizeSecretId(value: string): string {
  // Convert to uppercase and replace non-alphanumeric chars with underscores
  let sanitized = value.toUpperCase().replace(ALPHANUMERIC_WITH_HYPHENS, '_');

  // Collapse consecutive underscores into single underscore
  sanitized = sanitized.replace(/_+/g, '_');

  // Remove trailing underscores
  sanitized = sanitized.replace(TRAILING_UNDERSCORES_REGEX, '');

  return sanitized;
}

/** `abc-123-def` -> `SERVICE_ACCOUNT_ABC_123_DEF`, via {@link sanitizeSecretId}. */
export function generateServiceAccountSecretId(serviceAccountId: string): string {
  const sanitizedServiceAccountId = sanitizeSecretId(serviceAccountId);

  return `SERVICE_ACCOUNT_${sanitizedServiceAccountId}`;
}
