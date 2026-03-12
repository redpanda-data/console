/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Group } from 'components/redpanda-ui/components/group';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { useRef, useState } from 'react';

import { AddTopicStep } from '../onboarding/add-topic-step';
import { AddUserStep } from '../onboarding/add-user-step';
import { MiniWizardStep, MiniWizardStepper, type MiniWizardStepperSteps, stepMotionProps } from '../types/constants';
import type { ConnectComponentType } from '../types/schema';
import type {
  AddTopicFormData,
  AddUserFormData,
  BaseStepRef,
  ServiceAccountSubmissionData,
  UserStepRef,
} from '../types/wizard';

function getNextLabel(isLast: boolean): string {
  return isLast ? 'Done' : 'Next';
}

function buildWizardResult(
  topicName: string | undefined,
  data: AddUserFormData | ServiceAccountSubmissionData
): MiniWizardResult {
  const result: MiniWizardResult = { topicName };
  if ('authMethod' in data && data.authMethod === 'service-account') {
    result.authMethod = 'service-account';
    result.serviceAccountName = data.serviceAccountName;
    result.serviceAccountId = data.serviceAccountId;
    result.serviceAccountSecretName = data.serviceAccountSecretName;
  } else if ('username' in data) {
    result.authMethod = 'sasl';
    result.username = data.username;
    result.saslMechanism = data.saslMechanism;
    result.consumerGroup = data.consumerGroup;
  }
  return result;
}

export type MiniWizardResult = {
  topicName?: string;
  // SASL auth
  username?: string;
  saslMechanism?: string;
  consumerGroup?: string;
  // Service account auth
  authMethod?: 'sasl' | 'service-account';
  serviceAccountName?: string;
  serviceAccountId?: string;
  serviceAccountSecretName?: string;
};

type RedpandaMiniWizardProps = {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (result: MiniWizardResult) => void;
  connectionName: string;
  connectionType: ConnectComponentType;
};

export const RedpandaMiniWizard = ({
  isOpen,
  onClose,
  onComplete,
  connectionName,
  connectionType,
}: RedpandaMiniWizardProps) => (
  <Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
    <DialogContent size="xl">
      <MiniWizardStepper.Provider initialStep={MiniWizardStep.ADD_TOPIC}>
        {({ methods }) => (
          <MiniWizardContent
            connectionName={connectionName}
            connectionType={connectionType}
            methods={methods}
            onClose={onClose}
            onComplete={onComplete}
          />
        )}
      </MiniWizardStepper.Provider>
    </DialogContent>
  </Dialog>
);

type MiniWizardContentProps = {
  connectionName: string;
  connectionType: ConnectComponentType;
  methods: MiniWizardStepperSteps;
  onClose: () => void;
  onComplete: (result: MiniWizardResult) => void;
};

function MiniWizardContent({ connectionName, connectionType, methods, onClose, onComplete }: MiniWizardContentProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [topicName, setTopicName] = useState<string>();
  const topicStepRef = useRef<BaseStepRef<AddTopicFormData>>(null);
  const userStepRef = useRef<UserStepRef>(null);

  const isTopicStep = methods.current.id === MiniWizardStep.ADD_TOPIC;

  const handleNext = async () => {
    if (isTopicStep) {
      setIsSubmitting(true);
      try {
        const result = await topicStepRef.current?.triggerSubmit();
        if (result?.success && result.data) {
          setTopicName(result.data.topicName);
          methods.next();
        }
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setIsSubmitting(true);
      try {
        const result = await userStepRef.current?.triggerSubmit();
        if (result?.success && result.data) {
          onComplete(buildWizardResult(topicName, result.data));
        }
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleSkip = () => {
    if (isTopicStep) {
      methods.next();
    } else {
      onComplete({ topicName });
    }
  };

  const handleBack = () => {
    if (methods.isFirst) {
      onClose();
    } else {
      methods.prev();
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Configure {connectionName} {connectionType}
        </DialogTitle>
        <DialogDescription>
          {isTopicStep ? 'Select or create a topic for this component.' : 'Configure user authentication.'}
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <MiniWizardStepper.Navigation>
          {methods.all.map((step) => (
            <MiniWizardStepper.Step key={step.id} of={step.id} onClick={() => methods.goTo(step.id)}>
              <MiniWizardStepper.Title>{step.title}</MiniWizardStepper.Title>
            </MiniWizardStepper.Step>
          ))}
        </MiniWizardStepper.Navigation>
        {methods.switch({
          [MiniWizardStep.ADD_TOPIC]: () => <AddTopicStep hideTitle ref={topicStepRef} {...stepMotionProps} />,
          [MiniWizardStep.ADD_USER]: () => (
            <AddUserStep
              hideTitle
              ref={userStepRef}
              showConsumerGroupFields={connectionType === 'input'}
              topicName={topicName}
              {...stepMotionProps}
            />
          ),
        })}
      </DialogBody>
      <DialogFooter className="w-full" justify="between">
        <Button disabled={isSubmitting} onClick={handleBack} variant="secondary-ghost">
          {methods.isFirst ? 'Cancel' : 'Back'}
        </Button>
        <Group className="w-auto">
          <Button disabled={isSubmitting} onClick={handleSkip} variant="secondary-ghost">
            Skip
          </Button>
          <Button className="min-w-[70px]" disabled={isSubmitting} onClick={handleNext}>
            {isSubmitting ? <Spinner /> : null}
            {!isSubmitting && getNextLabel(methods.isLast)}
          </Button>
        </Group>
      </DialogFooter>
    </>
  );
}
