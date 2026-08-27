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

import type { DataTable } from '@redpanda-data/ui';
import type { ComponentProps } from 'react';

/**
 * Column and row types for the legacy `@redpanda-data/ui` DataTable.
 *
 * It carries its own nested `@tanstack/react-table` v8, while ours is v9 — so importing `ColumnDef`
 * here would hand it the wrong shape. Deriving from the component resolves the types through the
 * library's own module graph instead. Delete alongside the last legacy DataTable.
 */
type LegacyDataTableProps<T> = ComponentProps<typeof DataTable<T>>;

export type LegacyColumnDef<T> = LegacyDataTableProps<T>['columns'][number];
export type LegacyRow<T> = Parameters<NonNullable<LegacyDataTableProps<T>['getRowCanExpand']>>[0];
