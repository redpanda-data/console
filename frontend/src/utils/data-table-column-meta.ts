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

import type { DataTableColumnDef } from 'components/redpanda-ui/components/data-table';

/**
 * Layout hints our hand-rolled tables read off a column. The registry closes its own column meta at
 * `{ label?: string }` — TanStack v9 fixes the meta type per feature bundle, and our tables have to
 * stay assignable to the registry's `DataTableColumnHeader`/`DataTablePagination`, so we cannot
 * declare a bundle of our own. These two helpers keep the resulting cast in one place instead of
 * spread across every column definition.
 */
export type ConsoleColumnMeta = {
  label?: string;
  headWidth?: 'sm' | 'md' | 'full' | 'fit';
  align?: 'left' | 'center' | 'right';
};

type RegistryColumnMeta = NonNullable<Extract<DataTableColumnDef<Record<string, unknown>>, { meta?: unknown }>['meta']>;

/** Attach console layout hints to a column definition. */
export const columnMeta = (meta: ConsoleColumnMeta) => meta as RegistryColumnMeta;

/** Read them back off a column definition. */
export const readColumnMeta = (meta: unknown): ConsoleColumnMeta => (meta ?? {}) as ConsoleColumnMeta;
