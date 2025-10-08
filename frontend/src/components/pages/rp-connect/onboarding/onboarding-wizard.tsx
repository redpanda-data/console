import { create } from '@bufbuild/protobuf';
import PageContent from 'components/misc/page-content';
import { Button } from 'components/redpanda-ui/components/button';
import { defineStepper } from 'components/redpanda-ui/components/stepper';
import { cn } from 'components/redpanda-ui/lib/utils';
import { useSessionStorage } from 'hooks/use-session-storage';
import { runInAction } from 'mobx';
import { ListTopicsRequestSchema } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import { useLegacyListUsersQuery } from 'react-query/api/user';
import { useSearchParams } from 'react-router-dom';
import { CONNECT_WIZARD_CONNECTOR_KEY } from 'state/connect/state';
import { uiState } from 'state/ui-state';

import { AddTopicStep } from './add-topic-step';
import { AddUserStep } from './add-user-step';
import { ConnectTiles } from './connect-tiles';
import RpConnectPipelinesCreate from '../pipelines-create';
import { WizardStep, type WizardStepType } from '../types/constants';
import type { ConnectComponentType } from '../types/schema';
import type { BaseStepRef, WizardFormData } from '../types/wizard';
import { handleStepResult } from '../utils/wizard';

const stepDefinitions = [
  {
    id: WizardStep.ADD_INPUT,
    title: 'Send data',
  },
  { id: WizardStep.ADD_OUTPUT, title: 'Receive data' },
  { id: WizardStep.ADD_TOPIC, title: 'Add a topic' },
  { id: WizardStep.ADD_USER, title: 'Add a user' },
  { id: WizardStep.CREATE_CONFIG, title: 'Create pipeline' },
];

const { Stepper, Steps } = defineStepper(...stepDefinitions);

type Steps = typeof Steps;

export const ConnectOnboardingWizard = () => {
  const [persistedConnector, setPersistedConnector] = useSessionStorage<Partial<WizardFormData>>(
    CONNECT_WIZARD_CONNECTOR_KEY,
    {}
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

  const addInputStepRef = useRef<BaseStepRef>(null);
  const addOutputStepRef = useRef<BaseStepRef>(null);
  const addTopicStepRef = useRef<BaseStepRef>(null);
  const addUserStepRef = useRef<BaseStepRef>(null);

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

  const handleInputChange = useCallback(
    (connectionName: string, connectionType: ConnectComponentType) => {
      setPersistedConnector({
        input: { connectionName, connectionType },
        ...(persistedConnector.output && { output: persistedConnector.output }),
      });
    },
    [setPersistedConnector, persistedConnector]
  );

  const handleOutputChange = useCallback(
    (connectionName: string, connectionType: ConnectComponentType) => {
      setPersistedConnector({
        output: { connectionName, connectionType },
        ...(persistedConnector.input && { input: persistedConnector.input }),
      });
    },
    [setPersistedConnector, persistedConnector]
  );

  const handleNext = async (methods: Steps) => {
    switch (methods.current.id) {
      case WizardStep.ADD_INPUT: {
        // Only validate if user has selected something
        if (persistedConnector.input?.connectionName || persistedConnector.input?.connectionType) {
          const result = await addInputStepRef.current?.triggerSubmit();
          handleStepResult(result, methods.next);
        } else {
          // Skip if no selection made
          methods.next();
        }
        break;
      }
      case WizardStep.ADD_OUTPUT: {
        // Only validate if user has selected something
        if (persistedConnector.output?.connectionName || persistedConnector.output?.connectionType) {
          const result = await addOutputStepRef.current?.triggerSubmit();
          handleStepResult(result, methods.next);
        } else {
          // Skip if no selection made
          methods.next();
        }
        break;
      }
      case WizardStep.ADD_TOPIC: {
        const result = await addTopicStepRef.current?.triggerSubmit();
        handleStepResult(result, methods.next);
        break;
      }
      case WizardStep.ADD_USER: {
        const result = await addUserStepRef.current?.triggerSubmit();
        handleStepResult(result, methods.next);
        break;
      }
      default:
        methods.next();
    }
  };

  const handleSkip = (methods: Steps) => {
    methods.goTo(WizardStep.CREATE_CONFIG);
  };

  const getCurrentStepLoading = (currentStepId: WizardStepType): boolean => {
    switch (currentStepId) {
      case WizardStep.ADD_INPUT:
        // Only check loading if user has made a selection
        return persistedConnector.input?.connectionName || persistedConnector.input?.connectionType
          ? (addInputStepRef.current?.isLoading ?? false)
          : false;
      case WizardStep.ADD_OUTPUT:
        // Only check loading if user has made a selection
        return persistedConnector.output?.connectionName || persistedConnector.output?.connectionType
          ? (addOutputStepRef.current?.isLoading ?? false)
          : false;
      case WizardStep.ADD_TOPIC:
        return addTopicStepRef.current?.isLoading ?? false;
      case WizardStep.ADD_USER:
        return addUserStepRef.current?.isLoading ?? false;
      default:
        return false;
    }
  };

  return (
    <PageContent>
      <Stepper.Provider className="space-y-2" initialStep={initialStep}>
        {({ methods }) => {
          const isCurrentStepLoading = getCurrentStepLoading(methods.current.id);

          return (
            <div className="relative flex flex-col gap-6">
              <div className="flex h-full flex-col gap-6 pt-4">
                <div className="flex flex-col space-y-2 text-center">
                  <Stepper.Navigation>
                    {stepDefinitions.map((step) => (
                      <Stepper.Step key={step.id} of={step.id} onClick={() => methods.goTo(step.id)}>
                        <Stepper.Title>{step.title}</Stepper.Title>
                      </Stepper.Step>
                    ))}
                  </Stepper.Navigation>
                </div>
                {methods.switch({
                  [WizardStep.ADD_INPUT]: () => (
                    <ConnectTiles
                      componentTypeFilter={['input']}
                      defaultConnectionName={persistedConnector.input?.connectionName}
                      defaultConnectionType={persistedConnector.input?.connectionType}
                      key="input-connector-tiles"
                      onChange={handleInputChange}
                      ref={addInputStepRef}
                      tileWrapperClassName="min-h-[300px] max-h-[40vh]"
                      title="Send data to your pipeline"
                    />
                  ),
                  [WizardStep.ADD_OUTPUT]: () => (
                    <ConnectTiles
                      componentTypeFilter={['output']}
                      defaultConnectionName={persistedConnector.output?.connectionName}
                      defaultConnectionType={persistedConnector.output?.connectionType}
                      key="output-connector-tiles"
                      onChange={handleOutputChange}
                      ref={addOutputStepRef}
                      tileWrapperClassName="min-h-[300px] max-h-[40vh]"
                      title="Read data from your pipeline"
                    />
                  ),
                  // TODO add persisted data to both steps
                  [WizardStep.ADD_TOPIC]: () => <AddTopicStep ref={addTopicStepRef} topicList={topicList.topics} />,
                  [WizardStep.ADD_USER]: () => <AddUserStep ref={addUserStepRef} usersList={usersList?.users} />,
                  [WizardStep.CREATE_CONFIG]: () => <RpConnectPipelinesCreate matchedPath="/rp-connect/wizard" />,
                })}
              </div>
              <Stepper.Controls className={cn(!methods.isFirst && 'justify-between')}>
                {!(methods.isFirst || methods.isLast) && (
                  <Button onClick={methods.prev} type="button" variant="secondary">
                    Previous
                  </Button>
                )}
                <div className="flex gap-2">
                  {!methods.isLast && (
                    <Button onClick={() => handleSkip(methods)} type="button" variant="outline">
                      Skip
                    </Button>
                  )}
                  {!methods.isLast && (
                    <Button disabled={isCurrentStepLoading} onClick={() => handleNext(methods)}>
                      {isCurrentStepLoading ? 'Loading...' : 'Next'}
                    </Button>
                  )}
                </div>
              </Stepper.Controls>
            </div>
          );
        }}
      </Stepper.Provider>
    </PageContent>
  );
};
