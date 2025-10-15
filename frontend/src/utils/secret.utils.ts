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
 * Regex to remove trailing underscores from secret IDs
 */
const TRAILING_UNDERSCORES_REGEX = /_+$/;

/**
 * Sanitizes a string to match the secret ID regex pattern: ^[A-Z][A-Z0-9_]*$
 *
 * This function:
 * - Converts the input to uppercase
 * - Replaces all non-alphanumeric characters (except underscores) with underscores
 * - Collapses consecutive underscores into a single underscore
 * - Removes trailing underscores
 *
 * @param value - The string to sanitize
 * @returns The sanitized string that matches the pattern ^[A-Z][A-Z0-9_]*$
 *
 * @example
 * sanitizeSecretId("my-agent") // Returns "MY_AGENT"
 * sanitizeSecretId("abc-123-def") // Returns "ABC_123_DEF"
 * sanitizeSecretId("test__") // Returns "TEST"
 * sanitizeSecretId("test@#$agent") // Returns "TEST_AGENT"
 */
export function sanitizeSecretId(value: string): string {
  // Convert to uppercase and replace non-alphanumeric chars with underscores
  let sanitized = value.toUpperCase().replace(/[^A-Z0-9_]/g, '_');

  // Collapse consecutive underscores into single underscore
  sanitized = sanitized.replace(/_+/g, '_');

  // Remove trailing underscores
  sanitized = sanitized.replace(TRAILING_UNDERSCORES_REGEX, '');

  return sanitized;
}

/**
 * Generates a service account secret ID with the format: SA_{service_account_xid}_{resource_name}
 *
 * Both the service account ID and resource name are sanitized to match the pattern ^[A-Z][A-Z0-9_]*$
 *
 * @param serviceAccountId - The service account ID (may contain hyphens, lowercase, etc.)
 * @param resourceName - The resource name (e.g., agent name, pipeline name)
 * @returns The formatted secret ID
 *
 * @example
 * generateServiceAccountSecretId("abc-123-def", "My Agent")
 * // Returns "SA_ABC_123_DEF_MY_AGENT"
 */
export function generateServiceAccountSecretId(serviceAccountId: string, resourceName: string): string {
  const sanitizedServiceAccountId = sanitizeSecretId(serviceAccountId);
  const sanitizedResourceName = sanitizeSecretId(resourceName);

  return `SA_${sanitizedServiceAccountId}_${sanitizedResourceName}`;
}
