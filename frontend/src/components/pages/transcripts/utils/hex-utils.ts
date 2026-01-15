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

export const bytesToHex = (bytes: Uint8Array): string => {
  // Optimized conversion using Array.from with map for better performance with large datasets.
  // This approach avoids the overhead of individual array assignments and string concatenation.
  // See: https://stackoverflow.com/a/40031979
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};
