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
import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useRef, useState } from 'react';

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
import { applyRedpandaSetup, getConnectTemplate } from '../utils/yaml';

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
 * Stepper dialog for configuring a Redpanda connector (topic + user).
 */
export function RedpandaConnectorSetupWizard({
  connectionName,
  connectionType,
  initialStep = RedpandaConnectorSetupStep.ADD_TOPIC,
  onClose,
  onComplete,
}: {
  connectionName: string;
  connectionType: ConnectComponentType;
  initialStep?: (typeof RedpandaConnectorSetupStep)[keyof typeof RedpandaConnectorSetupStep];
  onClose: () => void;
  onComplete: (result: RedpandaSetupResult) => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [topicName, setTopicName] = useState<string>();
  const topicStepRef = useRef<BaseStepRef<AddTopicFormData>>(null);
  const userStepRef = useRef<UserStepRef>(null);

  const isTopicStep = initialStep === RedpandaConnectorSetupStep.ADD_TOPIC;

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: stepper submit logic with service-account vs SASL branching
  const submitStep = async (methods: RedpandaConnectorSetupSteps) => {
    if (methods.current.id === RedpandaConnectorSetupStep.ADD_TOPIC) {
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
          let authData: Partial<RedpandaSetupResult> = {};
          if ('authMethod' in data && data.authMethod === 'service-account') {
            authData = {
              authMethod: 'service-account',
              serviceAccountName: data.serviceAccountName,
              serviceAccountId: data.serviceAccountId,
              serviceAccountSecretName: data.serviceAccountSecretName,
            };
          } else if ('username' in data) {
            authData = {
              authMethod: 'sasl',
              username: data.username,
              saslMechanism: data.saslMechanism,
              consumerGroup: data.consumerGroup,
            };
          }
          onComplete({ topicName, ...authData });
        }
      }
    }
  };

  const handleNext = async (methods: RedpandaConnectorSetupSteps) => {
    setIsSubmitting(true);
    try {
      await submitStep(methods);
      setIsSubmitting(false);
    } catch (e) {
      setIsSubmitting(false);
      throw e;
    }
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <DialogContent size="xl">
        <RedpandaConnectorSetupStepper.Provider initialStep={initialStep}>
          {({ methods }) => (
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
                    <RedpandaConnectorSetupStepper.Step
                      key={step.id}
                      of={step.id}
                      onClick={() => methods.goTo(step.id)}
                    >
                      <RedpandaConnectorSetupStepper.Title>{step.title}</RedpandaConnectorSetupStepper.Title>
                    </RedpandaConnectorSetupStepper.Step>
                  ))}
                </RedpandaConnectorSetupStepper.Navigation>
                {methods.switch({
                  [RedpandaConnectorSetupStep.ADD_TOPIC]: () => (
                    <AddTopicStep hideTitle ref={topicStepRef} {...stepMotionProps} />
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
                <Button
                  disabled={isSubmitting}
                  onClick={methods.isFirst ? onClose : methods.prev}
                  variant="secondary-ghost"
                >
                  {methods.isFirst ? 'Cancel' : 'Back'}
                </Button>
                <Group className="w-auto">
                  <Button
                    disabled={isSubmitting}
                    onClick={methods.isLast ? () => onComplete({}) : methods.next}
                    variant="secondary-ghost"
                  >
                    Skip
                  </Button>
                  <Button className="min-w-[70px]" disabled={isSubmitting} onClick={() => handleNext(methods)}>
                    {isSubmitting ? <Spinner /> : null}
                    {!isSubmitting && (methods.isLast ? 'Done' : 'Next')}
                  </Button>
                </Group>
              </DialogFooter>
            </>
          )}
        </RedpandaConnectorSetupStepper.Provider>
      </DialogContent>
    </Dialog>
  );
}

type ConnectorWizardProps = {
  addConnectorType: ConnectComponentType | 'resource' | null;
  onClose: () => void;
  components: ConnectComponentSpec[];
  componentList?: ComponentList;
  yamlContent: string;
  onYamlChange: (yaml: string) => void;
};

export function ConnectorWizard({
  addConnectorType,
  onClose,
  components,
  componentList,
  yamlContent,
  onYamlChange,
}: ConnectorWizardProps) {
  const [redpandaConnectorConfig, setRedpandaConnectorConfig] = useState<{
    connectionName: string;
    connectionType: ConnectComponentType;
  } | null>(null);

  const handleConnectorSelected = useCallback(
    (connectionName: string, connectionType: ConnectComponentType) => {
      onClose();

      if (REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(connectionName)) {
        setRedpandaConnectorConfig({ connectionName, connectionType });
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
      if (!redpandaConnectorConfig) {
        return;
      }

      const newYaml = applyRedpandaSetup({
        yamlContent,
        connectionName: redpandaConnectorConfig.connectionName,
        connectionType: redpandaConnectorConfig.connectionType as 'input' | 'output',
        result,
        components,
      });
      if (newYaml) {
        onYamlChange(newYaml);
      }
      setRedpandaConnectorConfig(null);
    },
    [redpandaConnectorConfig, yamlContent, components, onYamlChange]
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

      {redpandaConnectorConfig !== null ? (
        <RedpandaConnectorSetupWizard
          connectionName={redpandaConnectorConfig.connectionName}
          connectionType={redpandaConnectorConfig.connectionType}
          onClose={() => setRedpandaConnectorConfig(null)}
          onComplete={handleRedpandaSetupComplete}
        />
      ) : null}
    </>
  );
}
