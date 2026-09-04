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
import { Check } from 'lucide-react';

/**
 * Presentational step indicator, replacing Chakra's `<Stepper index={…}>`.
 *
 * The Registry ships `defineStepper`, but that owns navigation through its own `methods`. This
 * wizard keeps `currentStep` in `ReassignPartitions`'s own state and every guard reads it, so the
 * indicator stays a pure function of that index — nothing here can move the wizard.
 */
export const WizardSteps = ({ steps, currentStep }: { steps: { title: string }[]; currentStep: number }) => (
  <ol aria-label="Reassignment steps" className="flex items-center">
    {steps.map((step, index) => {
      const isComplete = index < currentStep;
      const isActive = index === currentStep;

      return (
        <li
          aria-current={isActive ? 'step' : undefined}
          className={cn('flex items-center gap-3', index < steps.length - 1 && 'flex-1')}
          key={step.title}
        >
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full border text-body-sm',
              isComplete && '!border-brand-line bg-brand text-brand-foreground',
              isActive && '!border-brand-line text-brand',
              !(isComplete || isActive) && 'text-subtle'
            )}
          >
            {isComplete ? <Check className="size-4" /> : index + 1}
          </span>
          <span className={cn('whitespace-nowrap', isActive ? 'text-strong' : 'text-subtle')}>{step.title}</span>
          {index < steps.length - 1 && <span className="mx-3 h-px flex-1 bg-border" />}
        </li>
      );
    })}
  </ol>
);
