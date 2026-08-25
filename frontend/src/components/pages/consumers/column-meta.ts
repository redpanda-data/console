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

import type { VariantProps } from 'class-variance-authority';
import type { tableHeadVariants } from 'components/redpanda-ui/components/table';

type TableHeadVariants = VariantProps<typeof tableHeadVariants>;

/** `columnDef.meta` shape shared by the consumer group tables, derived from the registry's TableHead variants. */
export type ColumnMeta = {
  align?: TableHeadVariants['align'];
  headWidth?: TableHeadVariants['width'];
};
