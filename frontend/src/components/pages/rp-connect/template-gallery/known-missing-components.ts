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

// Components that templates reference but are absent from the committed Connect
// schema snapshot (`src/assets/rp-connect-schema-full.json`) — either renamed
// since capture, enterprise-only, or pending the next snapshot refresh. The
// schema regression tests skip these so they still flag drift on known
// components. Re-capture the snapshot and prune this list as components land.
export const KNOWN_MISSING_COMPONENTS: ReadonlySet<string> = new Set([
  'aws_dynamodb_stream',
  'oracle_cdc',
  'sql_server_cdc',
  'iceberg',
]);
