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

import { cn } from 'components/redpanda-ui/lib/utils';

import type { ClientEffect, ClientEffectVerdict } from './shadow-box-model';

const VERDICT_BAR: Record<ClientEffectVerdict, string> = {
  allowed: 'border-l-success',
  rejected: 'border-l-destructive',
  partly: 'border-l-warning',
  ended: 'border-l-surface-strong',
  open: 'border-l-surface-strong',
  unknown: 'border-l-surface-strong',
};

/** What a client sees on this cluster right now, one row per kind of request. */
export const ShadowBoxClientEffects = ({ effects }: { effects: ClientEffect[] }) => (
  <ul aria-label="What clients see now" className="flex flex-col gap-2" data-testid="shadow-box-client-effects">
    {effects.map((effect) => (
      <li
        className={cn('border-l-4 py-0.5 pl-3', VERDICT_BAR[effect.verdict])}
        data-testid={`shadow-box-effect-${effect.id}`}
        data-verdict={effect.verdict}
        key={effect.id}
      >
        <div className="font-medium text-body-sm">{effect.label}</div>
        <div className="text-body-sm text-muted-foreground">{effect.detail}</div>
      </li>
    ))}
  </ul>
);
