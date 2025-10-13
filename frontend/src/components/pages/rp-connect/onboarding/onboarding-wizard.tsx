import { create } from '@bufbuild/protobuf';
import PageContent from 'components/misc/page-content';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Heading } from 'components/redpanda-ui/components/typography';
import { useSessionStorage } from 'hooks/use-session-storage';
import { ChevronLeftIcon } from 'lucide-react';
import { runInAction } from 'mobx';
import { ListTopicsRequestSchema } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import { useLegacyListUsersQuery } from 'react-query/api/user';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CONNECT_WIZARD_CONNECTOR_KEY } from 'state/connect/state';
import { uiState } from 'state/ui-state';

import { AddTopicStep } from './add-topic-step';
import { AddUserStep } from './add-user-step';
import { ConnectTiles } from './connect-tiles';
import RpConnectPipelinesCreate from '../pipelines-create';
import {
  WizardStep,
  WizardStepper,
  type WizardStepperSteps,
  type WizardStepType,
  wizardStepDefinitions,
} from '../types/constants';
import type { ExtendedConnectComponentSpec } from '../types/schema';
import type {
  AddTopicFormData,
  AddUserFormData,
  BaseStepRef,
  ConnectTilesFormData,
  WizardFormData,
} from '../types/wizard';
import { handleStepResult } from '../utils/wizard';

export type ConnectOnboardingWizardProps = {
  className?: string;
  additionalComponents?: ExtendedConnectComponentSpec[];
  onChange?: (connectorName: string, connectorType: string) => void;
  onCancel?: () => void;
};

export const ConnectOnboardingWizard = ({
  className,
  additionalComponents,
  onChange,
  onCancel: onCancelProp,
}: ConnectOnboardingWizardProps = {}) => {
  const [persistedWizardData, setPersistedWizardData] = useSessionStorage<Partial<WizardFormData>>(
    CONNECT_WIZARD_CONNECTOR_KEY,
    {}
  );
  const navigate = useNavigate();

  const persistedInputConnectionName = useMemo(
    () => persistedWizardData.input?.connectionName,
    [persistedWizardData.input?.connectionName]
  );
  const persistedInputConnectionType = useMemo(
    () => persistedWizardData.input?.connectionType,
    [persistedWizardData.input?.connectionType]
  );

  const [searchParams] = useSearchParams();

  const initialStep = useMemo(() => {
    const stepSearchParam = searchParams.get('step');
    switch (stepSearchParam) {
      case 'add-input':
        return WizardStep.ADD_INPUT;
      case 'add-output':
        return WizardStep.ADD_OUTPUT;
      case 'add-topic':
        return WizardStep.ADD_TOPIC;
      case 'add-user':
        return WizardStep.ADD_USER;
      case 'create-config':
        return WizardStep.CREATE_CONFIG;
      default:
        return WizardStep.ADD_INPUT;
    }
  }, [searchParams]);

  const addInputStepRef = useRef<BaseStepRef<ConnectTilesFormData>>(null);
  const addOutputStepRef = useRef<BaseStepRef<ConnectTilesFormData>>(null);
  const addTopicStepRef = useRef<BaseStepRef<AddTopicFormData>>(null);
  const addUserStepRef = useRef<BaseStepRef<AddUserFormData>>(null);

  const { data: topicList } = useLegacyListTopicsQuery(create(ListTopicsRequestSchema, {}), {
    hideInternalTopics: true,
  });
  const { data: usersList } = useLegacyListUsersQuery();

  useEffect(() => {
    runInAction(() => {
      uiState.pageTitle = 'Create Pipeline';
      uiState.pageBreadcrumbs = [
        { title: 'Redpanda Connect', linkTo: '/connect-clusters' },
        { title: 'Create Pipeline', linkTo: '' },
      ];
    });
  }, []);

  const handleNext = async (methods: WizardStepperSteps) => {
    switch (methods.current.id) {
      case WizardStep.ADD_INPUT: {
        const result = await addInputStepRef.current?.triggerSubmit();
        if (result?.success) {
          // Save to session storage only after validation passes
          if (result.data?.connectionName && result.data?.connectionType) {
            setPersistedWizardData({
              input: {
                connectionName: result.data.connectionName,
                connectionType: result.data.connectionType,
              },
              ...(persistedWizardData.output && { output: persistedWizardData.output }),
            });
            // Notify parent of connector selection
            onChange?.(result.data.connectionName, result.data.connectionType as string);
          }
          methods.next();
        }
        break;
      }
      case WizardStep.ADD_OUTPUT: {
        const result = await addOutputStepRef.current?.triggerSubmit();
        if (result?.success) {
          // Save to session storage only after validation passes
          if (result.data?.connectionName && result.data?.connectionType) {
            setPersistedWizardData({
              output: {
                connectionName: result.data.connectionName,
                connectionType: result.data.connectionType,
              },
              ...(persistedWizardData.input && { input: persistedWizardData.input }),
            });
            // Notify parent of connector selection
            onChange?.(result.data.connectionName, result.data.connectionType as string);
          }
          methods.next();
        }
        break;
      }
      case WizardStep.ADD_TOPIC: {
        const result = await addTopicStepRef.current?.triggerSubmit();
        if (result?.success) {
          setPersistedWizardData({
            topicName: result.data?.topicName,
          });
        }
        handleStepResult(result, methods.next);
        break;
      }
      case WizardStep.ADD_USER: {
        const result = await addUserStepRef.current?.triggerSubmit();
        if (result?.success) {
          setPersistedWizardData({
            username: result.data?.username,
          });
        }
        handleStepResult(result, methods.next);
        break;
      }
      default:
        methods.next();
    }
  };

  const handleSkip = (methods: WizardStepperSteps) => {
    methods.goTo(WizardStep.CREATE_CONFIG);
  };

  const getCurrentStepLoading = (currentStepId: WizardStepType): boolean => {
    switch (currentStepId) {
      case WizardStep.ADD_INPUT:
        return addInputStepRef.current?.isLoading ?? false;
      case WizardStep.ADD_OUTPUT:
        return addOutputStepRef.current?.isLoading ?? false;
      case WizardStep.ADD_TOPIC:
        return addTopicStepRef.current?.isLoading ?? false;
      case WizardStep.ADD_USER:
        return addUserStepRef.current?.isLoading ?? false;
      default:
        return false;
    }
  };

  const handleCancel = useCallback(() => {
    if (onCancelProp) {
      onCancelProp();
    } else {
      navigate('/connect-clusters');
    }
  }, [onCancelProp, navigate]);

  return (
    <PageContent className={className}>
      <WizardStepper.Provider className="space-y-2" initialStep={initialStep}>
        {({ methods }) => {
          const isCurrentStepLoading = getCurrentStepLoading(methods.current.id);

          return (
            <div className="relative flex flex-col gap-6">
              <div className="flex h-full flex-col gap-6 pt-4">
                <div className="flex flex-col space-y-2 text-center">
                  <WizardStepper.Navigation>
                    {wizardStepDefinitions.map((step) => (
                      <WizardStepper.Step key={step.id} of={step.id} onClick={() => methods.goTo(step.id)}>
                        <WizardStepper.Title>{step.title}</WizardStepper.Title>
                      </WizardStepper.Step>
                    ))}
                  </WizardStepper.Navigation>
                </div>
                {methods.switch({
                  [WizardStep.ADD_INPUT]: () => (
                    <ConnectTiles
                      additionalComponents={additionalComponents}
                      componentTypeFilter={['input']}
                      defaultConnectionName={persistedInputConnectionName}
                      defaultConnectionType={persistedInputConnectionType}
                      handleSkip={() => handleSkip(methods)}
                      key="input-connector-tiles"
                      ref={addInputStepRef}
                      tileWrapperClassName="min-h-[300px] max-h-[40vh]"
                      title="Send data to your pipeline"
                    />
                  ),
                  [WizardStep.ADD_OUTPUT]: () => (
                    <ConnectTiles
                      additionalComponents={additionalComponents}
                      componentTypeFilter={['output']}
                      defaultConnectionName={persistedWizardData.output?.connectionName}
                      defaultConnectionType={persistedWizardData.output?.connectionType}
                      handleSkip={() => handleSkip(methods)}
                      key="output-connector-tiles"
                      ref={addOutputStepRef}
                      tileWrapperClassName="min-h-[300px] max-h-[40vh]"
                      title="Read data from your pipeline"
                    />
                  ),
                  [WizardStep.ADD_TOPIC]: () => <AddTopicStep ref={addTopicStepRef} topicList={topicList.topics} />,
                  [WizardStep.ADD_USER]: () => <AddUserStep ref={addUserStepRef} usersList={usersList?.users} />,
                  [WizardStep.CREATE_CONFIG]: () => (
                    <Card size="full">
                      <CardHeader>
                        <CardTitle>
                          <Heading level={2}>Create pipeline</Heading>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <RpConnectPipelinesCreate matchedPath="/rp-connect/wizard" />
                      </CardContent>
                    </Card>
                  ),
                })}
              </div>
              <WizardStepper.Controls className="justify-between">
                <div className="flex gap-2">
                  {!(methods.isFirst || methods.isLast) && (
                    <Button onClick={methods.prev} type="button" variant="secondary">
                      <ChevronLeftIcon />
                      Previous
                    </Button>
                  )}
                  <Button onClick={handleCancel} type="button" variant="outline">
                    Cancel
                  </Button>
                </div>
                <div className="flex gap-2">
                  {!methods.isLast && (
                    <Button onClick={() => handleNext(methods)} type="button" variant="outline">
                      Skip
                    </Button>
                  )}
                  {!methods.isLast && (
                    <Button disabled={isCurrentStepLoading} onClick={() => handleNext(methods)}>
                      {isCurrentStepLoading ? 'Loading...' : 'Next'}
                    </Button>
                  )}
                </div>
              </WizardStepper.Controls>
            </div>
          );
        }}
      </WizardStepper.Provider>
    </PageContent>
  );
};
