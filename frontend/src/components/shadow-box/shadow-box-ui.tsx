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

import { Badge } from 'components/redpanda-ui/components/badge';
import { StatusBadge, type StatusBadgeVariant } from 'components/redpanda-ui/components/status-badge';
import { useEffect, useState } from 'react';

import { BOX_PHASE_LABEL, type BoxPhase } from './shadow-box-model';

/** The current time, refreshed on an interval so time-in-state labels keep counting. */
export const useNow = (intervalMs = 30_000): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
};

/** Amber, not red, while it blocks: the box is intentional, but it stops traffic from the moment boxing begins. */
const PHASE_VARIANT: Record<BoxPhase, StatusBadgeVariant> = {
  unboxed: 'disabled',
  boxing: 'warning',
  boxed: 'warning',
  unboxing: 'informative',
};

export const ShadowBoxStateBadge = ({ phase, testId }: { phase: BoxPhase; testId?: string }) => (
  <StatusBadge
    pulsing={phase === 'boxing' || phase === 'unboxing'}
    size="sm"
    testId={testId ?? 'shadow-box-state-badge'}
    variant={PHASE_VARIANT[phase]}
  >
    {BOX_PHASE_LABEL[phase]}
  </StatusBadge>
);

/** Whether a shadow link can read under a fence's settings; undefined when Console can't check. */
export const CanReadBadge = ({ canRead, yes, no }: { canRead: boolean | undefined; yes: string; no: string }) => {
  if (canRead === undefined) {
    return (
      <Badge tone="default" variant="subtle">
        Can’t check
      </Badge>
    );
  }
  const label = canRead ? yes : no;
  return (
    <Badge tone={canRead ? 'success' : 'warning'} variant="subtle">
      {label}
    </Badge>
  );
};
