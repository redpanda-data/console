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

import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
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
import { InfoIcon } from 'lucide-react';
import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useRef, useState } from 'react';
import {
  useOnboardingTopicDataStore,
  useOnboardingUserDataStore,
  useOnboardingWizardDataStore,
} from 'state/onboarding-wizard-store';

import { AddConnectorDialog } from '../onboarding/add-connector-dialog';
import { AddTopicStep } from '../onboarding/add-topic-step';
import { AddUserStep } from '../onboarding/add-user-step';
import {
  REDPANDA_TOPIC_AND_USER_COMPONENTS,
  RedpandaConnectorSetupStep,
  RedpandaConnectorSetupStepper,
  type RedpandaConnectorSetupSteps,
  stepMotionProps,
} from '../types/constants';
import type { ConnectComponentSpec, ConnectComponentType } from '../types/schema';
import type { AddTopicFormData, BaseStepRef, UserStepRef } from '../types/wizard';
import { getConnectTemplate } from '../utils/yaml';

export type RedpandaSetupResult = {
  topicName?: string;
  username?: string;
  saslMechanism?: string;
  consumerGroup?: string;
  authMethod?: 'sasl' | 'service-account';
  serviceAccountName?: string;
  serviceAccountId?: string;
  serviceAccountSecretName?: string;
};

/**
 * Stepper dialog content for configuring a Redpanda connector (topic + user).
 * Rendered inside a Dialog by ConnectorWizard when a Redpanda component is selected.
 */
function RedpandaSetupSteps({
  connectionName,
  connectionType,
  methods,
  onClose,
  onComplete,
  serverlessHint,
}: {
  connectionName: string;
  connectionType: ConnectComponentType;
  methods: RedpandaConnectorSetupSteps;
  onClose: () => void;
  onComplete: (result: RedpandaSetupResult) => void;
  serverlessHint?: string;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [topicName, setTopicName] = useState<string>();
  const topicStepRef = useRef<BaseStepRef<AddTopicFormData>>(null);
  const userStepRef = useRef<UserStepRef>(null);

  const isTopicStep = methods.current.id === RedpandaConnectorSetupStep.ADD_TOPIC;

  const submitStep = async () => {
    if (isTopicStep) {
      const topicRef = topicStepRef.current;
      if (topicRef) {
        const result = await topicRef.triggerSubmit();
        if (result.success && result.data) {
          setTopicName(result.data.topicName);
          methods.next();
        }
      }
    } else {
      const userRef = userStepRef.current;
      if (userRef) {
        const result = await userRef.triggerSubmit();
        if (result.success && result.data) {
          const data = result.data;
          onComplete({
            topicName,
            ...('authMethod' in data && data.authMethod === 'service-account'
              ? {
                  authMethod: 'service-account' as const,
                  serviceAccountName: data.serviceAccountName,
                  serviceAccountId: data.serviceAccountId,
                  serviceAccountSecretName: data.serviceAccountSecretName,
                }
              : 'username' in data
                ? {
                    authMethod: 'sasl' as const,
                    username: data.username,
                    saslMechanism: data.saslMechanism,
                    consumerGroup: data.consumerGroup,
                  }
                : {}),
          });
        }
      }
    }
  };

  const handleNext = async () => {
    setIsSubmitting(true);
    try {
      await submitStep();
      setIsSubmitting(false);
    } catch (e) {
      setIsSubmitting(false);
      throw e;
    }
  };

  const handleSkip = () => {
    if (isTopicStep) {
      methods.next();
    } else {
      onComplete({ topicName });
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="capitalize">
          Configure {connectionName} {connectionType}
        </DialogTitle>
        <DialogDescription className="mt-4">
          {isTopicStep ? 'Select or create a topic.' : 'Configure user authentication.'}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="mt-4">
        <RedpandaConnectorSetupStepper.Navigation>
          {methods.all.map((step) => (
            <RedpandaConnectorSetupStepper.Step key={step.id} of={step.id} onClick={() => methods.goTo(step.id)}>
              <RedpandaConnectorSetupStepper.Title>{step.title}</RedpandaConnectorSetupStepper.Title>
            </RedpandaConnectorSetupStepper.Step>
          ))}
        </RedpandaConnectorSetupStepper.Navigation>
        {methods.switch({
          [RedpandaConnectorSetupStep.ADD_TOPIC]: () => (
            <>
              {serverlessHint ? (
                <Alert className="mt-4" icon={<InfoIcon className="h-4 w-4" />} variant="warning">
                  <AlertDescription>{serverlessHint}</AlertDescription>
                </Alert>
              ) : null}
              <AddTopicStep hideTitle ref={topicStepRef} {...stepMotionProps} />
            </>
          ),
          [RedpandaConnectorSetupStep.ADD_USER]: () => (
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
        <Button disabled={isSubmitting} onClick={methods.isFirst ? onClose : methods.prev} variant="secondary-ghost">
          {methods.isFirst ? 'Cancel' : 'Back'}
        </Button>
        <Group className="w-auto">
          <Button disabled={isSubmitting} onClick={handleSkip} variant="secondary-ghost">
            Skip
          </Button>
          <Button className="min-w-[70px]" disabled={isSubmitting} onClick={handleNext}>
            {isSubmitting ? <Spinner /> : null}
            {!isSubmitting && (methods.isLast ? 'Done' : 'Next')}
          </Button>
        </Group>
      </DialogFooter>
    </>
  );
}

type ConnectorWizardProps = {
  addConnectorType: ConnectComponentType | 'resource' | null;
  onClose: () => void;
  components: ConnectComponentSpec[];
  componentList?: ComponentList;
  yamlContent: string;
  onYamlChange: (yaml: string) => void;
  autoOpenRedpandaSetup?: { connectionName: string; connectionType: ConnectComponentType };
};

export function ConnectorWizard({
  addConnectorType,
  onClose,
  components,
  componentList,
  yamlContent,
  onYamlChange,
  autoOpenRedpandaSetup,
}: ConnectorWizardProps) {
  const wizardInputName = useOnboardingWizardDataStore((state) => state.input?.connectionName);

  const serverlessHint = autoOpenRedpandaSetup
    ? wizardInputName === 'redpanda'
      ? 'Create or select a topic you want to stream data from.'
      : `Stream data to a Redpanda topic from your ${wizardInputName} input.`
    : undefined;

  const [redpandaSetupConfig, setRedpandaSetupConfig] = useState<{
    connectionName: string;
    connectionType: ConnectComponentType;
  } | null>(autoOpenRedpandaSetup ?? null);

  const handleConnectorSelected = useCallback(
    (connectionName: string, connectionType: ConnectComponentType) => {
      onClose();

      if (REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(connectionName)) {
        setRedpandaSetupConfig({ connectionName, connectionType });
        return;
      }

      const newYaml = getConnectTemplate({
        connectionName,
        connectionType,
        components,
        showAdvancedFields: false,
        existingYaml: yamlContent,
      });
      if (newYaml) {
        onYamlChange(newYaml);
      }
    },
    [components, yamlContent, onYamlChange, onClose]
  );

  const handleRedpandaSetupComplete = useCallback(
    (result: RedpandaSetupResult) => {
      if (!redpandaSetupConfig) {
        return;
      }

      // Populate onboarding stores so schemaToConfig can read topic/user data
      if (result.topicName) {
        useOnboardingTopicDataStore.getState().setTopicData({ topicName: result.topicName });
      }
      if (result.authMethod === 'service-account' && result.serviceAccountId) {
        useOnboardingUserDataStore.getState().setUserData({
          authMethod: 'service-account',
          serviceAccountName: result.serviceAccountName ?? '',
          serviceAccountId: result.serviceAccountId,
          serviceAccountSecretName: result.serviceAccountSecretName ?? '',
        });
      } else if (result.username) {
        useOnboardingUserDataStore.getState().setUserData({
          authMethod: 'sasl',
          username: result.username,
          saslMechanism: (result.saslMechanism as 'SCRAM-SHA-256' | 'SCRAM-SHA-512') ?? 'SCRAM-SHA-256',
          consumerGroup: result.consumerGroup ?? '',
        });
      }

      try {
        const newYaml = getConnectTemplate({
          connectionName: redpandaSetupConfig.connectionName,
          connectionType: redpandaSetupConfig.connectionType,
          components,
          showAdvancedFields: false,
          existingYaml: yamlContent,
        });

        if (newYaml) {
          onYamlChange(newYaml);
        }
      } finally {
        useOnboardingTopicDataStore.getState().reset();
        useOnboardingUserDataStore.getState().reset();
        setRedpandaSetupConfig(null);
      }
    },
    [redpandaSetupConfig, components, yamlContent, onYamlChange]
  );

  return (
    <>
      {componentList ? (
        <AddConnectorDialog
          components={componentList}
          connectorType={
            addConnectorType === 'resource'
              ? (['cache', 'rate_limit', 'buffer', 'scanner', 'tracer', 'metrics'] satisfies ConnectComponentType[])
              : (addConnectorType ?? undefined)
          }
          isOpen={addConnectorType !== null}
          onAddConnector={handleConnectorSelected}
          onCloseAddConnector={onClose}
        />
      ) : null}

      {redpandaSetupConfig !== null && (
        <Dialog onOpenChange={(open) => !open && setRedpandaSetupConfig(null)} open>
          <DialogContent size="xl">
            <RedpandaConnectorSetupStepper.Provider initialStep={RedpandaConnectorSetupStep.ADD_TOPIC}>
              {({ methods }) => (
                <RedpandaSetupSteps
                  connectionName={redpandaSetupConfig.connectionName}
                  connectionType={redpandaSetupConfig.connectionType}
                  methods={methods}
                  onClose={() => setRedpandaSetupConfig(null)}
                  onComplete={handleRedpandaSetupComplete}
                  serverlessHint={serverlessHint}
                />
              )}
            </RedpandaConnectorSetupStepper.Provider>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
