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

import { lazy, Suspense } from 'react';

// Eager on purpose: the flag-override accessor must replace config.featureFlags
// before the first render reads it, and persisted visual-debugger classes should
// re-apply before paint. Both self-guard on IsDev.
import './feature-flag-overrides';
import './visual-debuggers';

import { IsDev } from '../../utils/env';

// The dialog UI and its YAML fixtures load as a separate chunk that production
// never fetches — gated at runtime so a REACT_APP_DEV_HINT build still works.
const LazyDebugHelper = lazy(() => import('./debug-dialog').then((m) => ({ default: m.DebugHelperRoot })));

export function DebugHelper() {
  if (!IsDev) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <LazyDebugHelper />
    </Suspense>
  );
}
