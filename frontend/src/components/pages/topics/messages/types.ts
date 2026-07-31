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

export type { MessageColumnConfig, RowDensity } from '../../../../stores/topic-settings-store';

/** Where a message search starts reading. Live tail is orthogonal — see the `live` URL param. */
export type ReadScopeMode = 'newest' | 'oldest' | 'offset' | 'timestamp';

export type FilterOp = 'contains' | 'eq' | 'neq' | 'gt' | 'lt';

/**
 * A committed filter chip. Structured chips carry `field`/`op`/`value`
 * (field is `key`, `value`, `partition`, `offset`, or a `value.<path>` accessor);
 * JavaScript chips carry the predicate code and an optional display name.
 */
export type FilterToken =
  | { kind: 'field'; field: string; op: FilterOp; value: string }
  | { kind: 'js'; code: string; name?: string };

/** The structured (non-JS) filter chips — the only kind persisted in the URL. */
export type FieldFilterToken = Extract<FilterToken, { kind: 'field' }>;
