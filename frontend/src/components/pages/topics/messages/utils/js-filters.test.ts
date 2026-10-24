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

import { buildFilterInterpreterCode, visibleJsFilters } from './js-filters';
import { describe, expect, test } from 'bun:test';
import { createFilterEntry } from '../../../../../state/ui';
import { decodeBase64 } from '../../../../../utils/utils';

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

describe('buildFilterInterpreterCode', () => {
  test('is empty when no filter is active and complete', () => {
    const inactive = createFilterEntry({ id: 'a', isActive: false, code: 'x', transpiledCode: 'return true' });
    const untranspiled = createFilterEntry({ id: 'b', isActive: true, code: 'x', transpiledCode: '' });
    expect(buildFilterInterpreterCode([inactive, untranspiled])).toBe('');
  });

  test('wraps each active filter in a function and ANDs their calls', () => {
    const first = createFilterEntry({ id: 'a', isActive: true, code: 'a', transpiledCode: 'value.ok' });
    const second = createFilterEntry({ id: 'b', isActive: true, code: 'b', transpiledCode: 'return key.ok' });
    expect(decodeBase64(buildFilterInterpreterCode([first, second]))).toBe(
      'function filter1() {\nreturn value.ok\n}\n\nfunction filter2() {\nreturn key.ok\n}\n\nreturn filter1() && filter2()'
    );
  });
});
