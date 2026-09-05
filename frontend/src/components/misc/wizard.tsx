/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Button } from 'components/redpanda-ui/components/button';
import { cn } from 'components/redpanda-ui/lib/utils';
import React from 'react';

import styles from './Wizard.module.scss';

export function Wizard<State extends WizardState>({ state }: { state: State }) {
  const [, currentStep] = state.getCurrentStep();
  return (
    <div className={styles.wizard}>
      <div className={styles.content}>{currentStep.content}</div>
      <div className={styles.footer}>
        {currentStep.nextButtonLabel !== null && (
          <Button className="px-8" disabled={!state.canContinue()} onClick={state.next} variant="primary">
            {currentStep.nextButtonLabel ?? 'Next'}
          </Button>
        )}

        {state.isFirst() ? null : (
          <Button className={cn('px-8', styles.prevButton)} onClick={state.previous} variant="link">
            {currentStep.prevButtonLabel ?? 'Back'}
          </Button>
        )}
      </div>
    </div>
  );
}

type WizardState = {
  getCurrentStep(): [number, WizardStep];

  getSteps(): WizardStep[];

  canContinue(): boolean;

  next(): Promise<void>;

  previous(): void;

  isLast(): boolean;

  isFirst(): boolean;
};

export type WizardStep = {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  content: React.ReactNode;
  prevButtonLabel?: React.ReactNode;
  nextButtonLabel?: React.ReactNode;

  postConditionMet(): boolean;
  transitionConditionMet?(): Promise<{ conditionMet: boolean }>;
};
