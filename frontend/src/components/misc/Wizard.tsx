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

import styles from './Wizard.module.scss';
import { Button, Steps } from 'antd';
import React from 'react';
import { ChevronRightIcon } from '@primer/octicons-react';

const { Step } = Steps;

export function Wizard<State extends WizardState>({ state }: { state: State }) {
    const [currentStepKey, currentStep] = state.getCurrentStep();
    return (<div className={styles.wizard}>
        <Steps current={currentStepKey} size={'small'} className={styles.steps} >
            {state.getSteps().map((step, i) => <Step
                key={i}
                title={step.title}
                description={step.description}
                icon={step.icon}
                className={styles.step}
                {...{ children: step.content }}
            />)}
        </Steps>
        <div className={styles.content}>{currentStep.content}</div>
        <div className={styles.footer}>
            {/* {!state.isFirst()
          ? <Button
              type={'default'}
              onClick={state.previous}
              className={styles.prevButton}>
            <ChevronLeftIcon/>
            {currentStep.prevButtonLabel ?? 'Previous Step'}
          </Button>
          : null} */}
            <Button
                type={'primary'}
                onClick={state.next}
                disabled={!state.canContinue()}
                className={styles.nextButton}>
                {currentStep.nextButtonLabel ?? state.isLast()
                    ? 'Finish'
                    : 'Next Step'}
                <ChevronRightIcon />
            </Button>
        </div>
    </div>);
}

interface WizardState {
    getCurrentStep(): [number, WizardStep];

    getSteps(): Array<WizardStep>;

    canContinue(): boolean;

    next(): Promise<any>;

    previous(): void;

    isLast(): boolean;

    isFirst(): boolean;
}

export interface WizardStep {
    title: React.ReactNode;
    description?: React.ReactNode;
    icon?: React.ReactNode;
    content: React.ReactNode;
    prevButtonLabel?: React.ReactNode;
    nextButtonLabel?: React.ReactNode;

    postConditionMet(): boolean;
    transitionConditionMet?(): Promise<{ conditionMet: boolean }>
}
