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

import { describe, expect, test } from 'vitest';

import { visibleJsFilters } from './js-filters';
import { createFilterEntry } from '../../../../../state/ui';

describe('visibleJsFilters', () => {
  test('shows active filters when JS filters can be used', () => {
    const active = createFilterEntry({ id: 'a', isActive: true });
    const inactive = createFilterEntry({ id: 'b', isActive: false });
    expect(visibleJsFilters([active, inactive], true)).toEqual([active]);
  });

  test('hides all chips when disabled (e.g. continuous mode), even active ones', () => {
    const active = createFilterEntry({ id: 'a', isActive: true });
    expect(visibleJsFilters([active], false)).toEqual([]);
  });
});
