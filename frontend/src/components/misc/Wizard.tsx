import styles from './Wizard.module.scss';
import {Button, Steps} from 'antd';
import React from 'react';

const {Step} = Steps;

export function Wizard<State extends WizardState>({state}: { state: State }) {
  const [currentStepKey, currentStep] = state.getCurrentStep();
  return (<div className={styles.wizard}>
    <Steps current={currentStepKey} size={'small'} className={styles.steps}>
      {state.getSteps().map(step => <Step {...step} />)}
    </Steps>
    <div className={styles.content}>{currentStep.content}</div>
    <div className={styles.footer}>
      {!state.isFirst()
          ? <Button
              type={'default'}
              onClick={state.previous}
              className={styles.prevButton}>
            Previous Step
          </Button>
          : null}
      <Button
          type={'primary'}
          onClick={state.next}
          disabled={!state.canContinue()}
          className={styles.nextButton}>
        {state.isLast()
            ? 'Finish'
            : 'Next Step'}
      </Button>
    </div>
  </div>);
}

interface WizardState {
  getCurrentStep(): [number, WizardStep];

  getSteps(): Array<WizardStep>;

  canContinue(): boolean;

  next(): void;

  previous(): void;

  isLast(): boolean;

  isFirst(): boolean;
}

export interface WizardStep {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  content: React.ReactNode;

  postConditionMet(): boolean;
}
