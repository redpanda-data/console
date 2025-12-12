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
 * Regex pattern to extract secret name from template string: ${secrets.SECRET_NAME}
 */
export const SECRET_TEMPLATE_REGEX = /^\$\{secrets\.([^}]+)\}$/;

/**
 * Extracts the secret name from the template string format: ${secrets.SECRET_NAME} -> SECRET_NAME
 */
export function extractSecretName(secretTemplate: string): string {
  if (!secretTemplate) {
    return '';
  }
  const match = secretTemplate.match(SECRET_TEMPLATE_REGEX);
  return match ? match[1] : secretTemplate; // Return original if no match (in case it's already just the ID)
}

/**
 * Formats a secret ID into the template format
 * SECRET_NAME -> ${secrets.SECRET_NAME}
 */
export function formatSecretTemplate(secretId: string): string {
  return `\${secrets.${secretId}}`;
}
