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
 * Sets breadcrumbs for security sub-pages while keeping the H1 as "Access Control".
 *
 * The header renders the last breadcrumb as H1. This hook always puts
 * "Access Control" as the last entry so the H1 stays constant.
 * The `trail` entries appear before it in the breadcrumb navigation.
 *
 * @example
 * useSecurityBreadcrumbs([
 *   { title: 'Users', linkTo: '/security/users' },
 *   { title: 'alice', linkTo: '/security/users/alice/details' },
 * ]);
 * // Breadcrumb trail: Users > alice
 * // H1 heading: Access Control
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
