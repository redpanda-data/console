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

import type { Timestamp } from '@bufbuild/protobuf/wkt';

const CLIENT_ID_TEMPLATE_REGEX = /^\$\{secrets\.([^.}]+)\.client_id\}$/;

/**
 * Extracts client_id value from template string format
 * @example extractClientIdFromTemplate("${secrets.MY_SECRET.client_id}") => "MY_SECRET"
 */
export function extractClientIdFromTemplate(template: string): string {
  const match = template.match(CLIENT_ID_TEMPLATE_REGEX);
  return match ? match[1] : template;
}

/**
 * Masks client ID for display (shows first 8 and last 4 chars)
 * @example maskClientId("auth0|1234567890abcdef") => "auth0|12••••cdef"
 */
export function maskClientId(clientId: string): string {
  if (clientId.length <= 12) {
    return clientId;
  }
  return `${clientId.slice(0, 8)}••••${clientId.slice(-4)}`;
}

/**
 * Formats date for display
 */
export function formatDate(timestamp: Timestamp | undefined): string {
  if (!timestamp) {
    return 'N/A';
  }
  const date = new Date(Number(timestamp.seconds) * 1000);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
