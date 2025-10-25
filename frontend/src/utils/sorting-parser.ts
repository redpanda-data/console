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

import type { SortingState } from '@tanstack/react-table';
import { createParser } from 'nuqs';

/**
 * Custom parser for SortingState to serialize/deserialize table sorting in URL
 * Format: "column1:asc,column2:desc"
 */
export const sortingParser = createParser<SortingState>({
  parse(queryValue) {
    if (!queryValue) {
      return [];
    }

    try {
      return queryValue.split(',').map((item) => {
        const [id, desc] = item.split(':');
        return {
          id,
          desc: desc === 'desc',
        };
      });
    } catch {
      return [];
    }
  },
  serialize(value) {
    if (!value || value.length === 0) {
      return '';
    }

    return value.map((item) => `${item.id}:${item.desc ? 'desc' : 'asc'}`).join(',');
  },
});
