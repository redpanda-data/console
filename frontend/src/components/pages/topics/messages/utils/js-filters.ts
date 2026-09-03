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

import type { FilterEntry } from '../../../../../state/ui';

/**
 * JS filter chips shown in the toolbar as "applied." Continuous mode drops the
 * filter predicate from the request entirely (see `canUseJsFilters`), so
 * showing an active chip in that state would claim a filter is being applied
 * when it isn't.
 */
export function visibleJsFilters(jsFilters: FilterEntry[], canUseJsFilters: boolean): FilterEntry[] {
  return canUseJsFilters ? jsFilters.filter((f) => f.isActive) : [];
}
