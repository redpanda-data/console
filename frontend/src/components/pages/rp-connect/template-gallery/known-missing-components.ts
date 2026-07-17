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

/**
 * Components templates reference but are absent from the committed schema snapshot
 * (enterprise-only or pending a snapshot refresh). Schema regression tests skip these;
 * prune as components land in the snapshot.
 */
export const KNOWN_MISSING_COMPONENTS: ReadonlySet<string> = new Set([]);
