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

// WARNING: Load the debug flag accessor before the first render or it reads flags before applying saved overrides.
import './feature-flag-overrides';
import './visual-debuggers';

import { IsDev } from '../../utils/env';

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
