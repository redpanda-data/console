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
import { sanitizeString, wrapFilterFragment } from '../../../../../utils/filter-helper';
import { encodeBase64 } from '../../../../../utils/utils';

/**
 * JS filter chips shown in the toolbar as "applied." Continuous mode drops the
 * filter predicate from the request entirely (see `canUseJsFilters`), so
 * showing an active chip in that state would claim a filter is being applied
 * when it isn't.
 */
export function visibleJsFilters(jsFilters: FilterEntry[], canUseJsFilters: boolean): FilterEntry[] {
  return canUseJsFilters ? jsFilters.filter((f) => f.isActive) : [];
}

/**
 * Combines the active JS filters into the base64 backend predicate (AND semantics): each filter
 * becomes a `filterN()` function and the predicate returns all of them `&&`-ed together.
 * Empty when no filter is active and complete.
 */
export function buildFilterInterpreterCode(jsFilters: FilterEntry[]): string {
  const active = jsFilters.filter((f) => f.isActive && f.code && f.transpiledCode);
  if (active.length === 0) {
    return '';
  }
  const functions = active.map((f, i) => `function filter${i + 1}() {\n${wrapFilterFragment(f.transpiledCode)}\n}`);
  const calls = active.map((_, i) => `filter${i + 1}()`).join(' && ');
  const code = `${functions.join('\n\n')}\n\nreturn ${calls}`;
  return encodeBase64(sanitizeString(code));
}
