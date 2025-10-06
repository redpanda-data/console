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

import { Button } from '@redpanda-data/ui';
import React from 'react';

import styles from './Wizard.module.scss';

export function Wizard<State extends WizardState>({ state }: { state: State }) {
  const [, currentStep] = state.getCurrentStep();
  return (
    <div className={styles.wizard}>
      <div className={styles.content}>{currentStep.content}</div>
      <div className={styles.footer}>
        {currentStep.nextButtonLabel !== null && (
          <Button colorScheme="brand" disabled={!state.canContinue()} onClick={state.next} px="8" variant="solid">
            {currentStep.nextButtonLabel ?? 'Next'}
          </Button>
        )}

        {!state.isFirst() ? (
          <Button className={styles.prevButton} onClick={state.previous} px="8" variant="link">
            {currentStep.prevButtonLabel ?? 'Back'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

type WizardState = {
  getCurrentStep(): [number, WizardStep];

  getSteps(): Array<WizardStep>;

  canContinue(): boolean;

  next(): Promise<any>;

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
