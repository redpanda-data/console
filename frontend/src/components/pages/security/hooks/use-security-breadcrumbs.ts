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

import { useLayoutEffect } from 'react';

import { uiState } from '../../../../state/ui-state';

/**
 * Breadcrumbs for security sub-pages. The header renders the last entry as the H1, so this always
 * appends "Access Control" after `trail` to keep that heading constant.
 */
export function useSecurityBreadcrumbs(trail: { title: string; linkTo: string }[]) {
  // Serialize trail for stable dependency comparison (avoids infinite re-renders from new array refs)
  const key = JSON.stringify(trail);
  useLayoutEffect(() => {
    uiState.pageBreadcrumbs = [...trail, { title: 'Access Control', linkTo: '/security' }];
    uiState.pageTitle = 'Access Control';
    // biome-ignore lint/correctness/useExhaustiveDependencies: key is a stable serialized representation of trail
  }, [key]);
}
