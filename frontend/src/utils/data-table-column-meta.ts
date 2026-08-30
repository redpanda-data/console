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

import type { VariantProps } from 'class-variance-authority';
import type { DataTableColumnDef } from 'components/redpanda-ui/components/data-table';
import type { tableHeadVariants } from 'components/redpanda-ui/components/table';

type TableHeadVariants = VariantProps<typeof tableHeadVariants>;

/**
 * Layout hints our hand-rolled tables read off a column, derived from TableHead's own variants so
 * the two cannot drift.
 *
 * The registry closes its column meta at `{ label?: string }` — TanStack v9 fixes the meta type per
 * feature bundle, and our tables have to stay assignable to the registry's `DataTableColumnHeader`
 * and `DataTablePagination`, so we cannot declare a bundle of our own. These two helpers keep the
 * resulting cast in one place instead of spread across every column definition.
 */
export type ConsoleColumnMeta = {
  label?: string;
  align?: TableHeadVariants['align'];
  headWidth?: TableHeadVariants['width'];
};

type RegistryColumnMeta = NonNullable<Extract<DataTableColumnDef<Record<string, unknown>>, { meta?: unknown }>['meta']>;

/** Attach console layout hints to a column definition. */
export const columnMeta = (meta: ConsoleColumnMeta) => meta as RegistryColumnMeta;

/** Read them back off a column definition. */
export const readColumnMeta = (meta: unknown): ConsoleColumnMeta => (meta ?? {}) as ConsoleColumnMeta;
