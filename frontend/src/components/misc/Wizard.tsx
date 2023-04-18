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
import { Steps } from 'antd';
import { Button } from '@redpanda-data/ui';
import React from 'react';

const { Step } = Steps;

export function Wizard<State extends WizardState>({ state }: { state: State }) {
    const [currentStepKey, currentStep] = state.getCurrentStep();
    return (
        <div className={styles.wizard}>
            <Steps current={currentStepKey} size={'small'} className={styles.steps}>
                {state.getSteps().map((step, i) => (
                    <Step
                        key={i}
                        title={step.title}
                        description={step.description}
                        icon={step.icon}
                        className={styles.step}
                        {...{ children: step.content }}
                    />
                ))}
            </Steps>
            <div className={styles.content}>{currentStep.content}</div>
            <div className={styles.footer}>
                {currentStep.nextButtonLabel !== null &&
                    <Button variant="solid" colorScheme="brand" onClick={state.next} disabled={!state.canContinue()} px="8">
                        {currentStep.nextButtonLabel ?? 'Next'}
                    </Button>
                }

                {!state.isFirst() ? (
                    <Button variant="outline" onClick={state.previous} className={styles.prevButton} px="8">
                        {currentStep.prevButtonLabel ?? 'Back'}
                    </Button>
                ) : null}

            </div>
        </div>
    );
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
    transitionConditionMet?(): Promise<{ conditionMet: boolean }>;
}
