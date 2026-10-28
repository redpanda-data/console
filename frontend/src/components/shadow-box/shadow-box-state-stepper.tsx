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

import { TonedIcon } from 'components/pages/shared/toned-icon';
import { cn } from 'components/redpanda-ui/lib/utils';
import { ArrowRightIcon } from 'lucide-react';
import { Fragment } from 'react';

import { BOX_PHASE_LABEL, BOX_PHASES, type BoxPhase } from './shadow-box-model';

/**
 * The four states in order, the cluster's current one marked, with the two that reject writes
 * bracketed: blocking starts in Boxing, not Boxed, and stops in Unboxing.
 */
export const ShadowBoxStateStepper = ({ phase }: { phase: BoxPhase }) => (
  <div
    className="grid max-w-3xl grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] gap-x-1.5 gap-y-1"
    data-testid="shadow-box-states"
  >
    <ol aria-label="Shadow box states" className="contents">
      {BOX_PHASES.map((state, index) => (
        <Fragment key={state}>
          {index > 0 ? (
            <li aria-hidden="true" className="flex items-center" role="presentation">
              <TonedIcon className="size-3.5" icon={ArrowRightIcon} tone="muted" />
            </li>
          ) : null}
          <li
            aria-current={state === phase ? 'step' : undefined}
            className={cn(
              'rounded-full border px-2 py-1 text-center text-body-sm',
              state === phase
                ? 'border-selected bg-selected-wash font-medium text-selected'
                : 'border-border text-muted-foreground'
            )}
            data-state={state}
          >
            {BOX_PHASE_LABEL[state]}
          </li>
        </Fragment>
      ))}
    </ol>
    <div
      className="col-start-3 col-end-6 flex items-center gap-1.5 text-caption text-muted-foreground"
      data-testid="shadow-box-blocks-bracket"
    >
      <span aria-hidden="true" className="h-2 flex-1 rounded-bl-sm border-b border-l border-warning-line" />
      <span>Rejects writes</span>
      <span aria-hidden="true" className="h-2 flex-1 rounded-br-sm border-r border-b border-warning-line" />
    </div>
  </div>
);
