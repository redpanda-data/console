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

import { StatusBadge, type StatusBadgeVariant } from 'components/redpanda-ui/components/status-badge';

import { BOX_PHASE_LABEL, type BoxPhase } from './shadow-box-model';

/** Amber, not red, while it blocks: the box is intentional, but it stops traffic from the moment boxing begins. */
const PHASE_VARIANT: Record<BoxPhase, StatusBadgeVariant> = {
  unboxed: 'disabled',
  boxing: 'warning',
  boxed: 'warning',
  unboxing: 'informative',
};

export const ShadowBoxStateBadge = ({
  phase,
  size = 'sm',
  testId,
}: {
  phase: BoxPhase;
  size?: 'sm' | 'md';
  testId?: string;
}) => (
  <StatusBadge
    pulsing={phase === 'boxing' || phase === 'unboxing'}
    size={size}
    testId={testId ?? 'shadow-box-state-badge'}
    variant={PHASE_VARIANT[phase]}
  >
    {BOX_PHASE_LABEL[phase]}
  </StatusBadge>
);
