import { create } from '@bufbuild/protobuf';
import PageContent from 'components/misc/PageContent';
import { Button } from 'components/redpanda-ui/components/button';
import { defineStepper } from 'components/redpanda-ui/components/stepper';
import { cn } from 'components/redpanda-ui/lib/utils';
import { useSessionStorage } from 'hooks/use-session-storage';
import { ListTopicsRequestSchema } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { useCallback, useMemo, useRef } from 'react';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import { useLegacyListUsersQuery } from 'react-query/api/user';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CONNECT_WIZARD_CONNECTOR_KEY } from 'state/connect/state';
import type { ConnectComponentType } from '../types/schema';
import type { BaseStepRef, WizardFormData } from '../types/wizard';
import { handleStepResult, WizardStep } from '../utils/wizard';
import { AddTopicStep } from './add-topic-step';
import { AddUserStep } from './add-user-step';
import { ConnectTiles } from './connect-tiles';

const stepDefinitions = [
  {
    id: WizardStep.ADD_INPUT,
    title: 'Send data',
  },
  { id: WizardStep.ADD_OUTPUT, title: 'Receive data' },
  { id: WizardStep.ADD_TOPIC, title: 'Add a topic' },
  { id: WizardStep.ADD_USER, title: 'Add a user' },
];

const { Stepper } = defineStepper(...stepDefinitions);

export const ConnectOnboardingWizard = () => {
  const [persistedConnector, setPersistedConnector] = useSessionStorage<Partial<WizardFormData>>(
    CONNECT_WIZARD_CONNECTOR_KEY,
    {},
  );

  const navigate = useNavigate();
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

  const handleInputChange = useCallback(
    (connectionName: string, connectionType: ConnectComponentType) => {
      setPersistedConnector({
        input: { connectionName, connectionType },
        ...(persistedConnector.output && { output: persistedConnector.output }),
      });
    },
    [setPersistedConnector, persistedConnector],
  );

  const handleOutputChange = useCallback(
    (connectionName: string, connectionType: ConnectComponentType) => {
      setPersistedConnector({
        output: { connectionName, connectionType },
        ...(persistedConnector.input && { input: persistedConnector.input }),
      });
    },
    [setPersistedConnector, persistedConnector],
  );

  const handleNext = async (methods: { current: { id: WizardStep }; next: () => void }) => {
    switch (methods.current.id) {
      case WizardStep.ADD_INPUT: {
        const result = await addInputStepRef.current?.triggerSubmit();
        handleStepResult(result, methods.next);
        break;
      }
      case WizardStep.ADD_OUTPUT: {
        const result = await addOutputStepRef.current?.triggerSubmit();
        handleStepResult(result, methods.next);
        break;
      }
      case WizardStep.ADD_TOPIC: {
        const result = await addTopicStepRef.current?.triggerSubmit();
        handleStepResult(result, methods.next);
        break;
      }
      case WizardStep.ADD_USER: {
        const result = await addUserStepRef.current?.triggerSubmit();
        handleStepResult(result, () => navigate('/rp-connect/create'));
        break;
      }
      default:
        methods.next();
    }
  };

  const handleSkip = () => {
    navigate('/rp-connect/create');
  };

  const getCurrentStepLoading = (currentStepId: WizardStep): boolean => {
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

  return (
    <PageContent>
      <Stepper.Provider className="space-y-2" initialStep={initialStep}>
        {({ methods }) => {
          const isCurrentStepLoading = getCurrentStepLoading(methods.current.id);

          return (
            <div className="flex flex-col gap-6 relative">
              <div className="flex flex-col gap-6 pt-4 h-full">
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
                      key="input-connector-tiles"
                      componentTypeFilter={['input']}
                      onChange={handleInputChange}
                      defaultConnectionName={persistedConnector.input?.connectionName}
                      defaultConnectionType={persistedConnector.input?.connectionType}
                      ref={addInputStepRef}
                      title="Send data to your pipeline"
                      tileWrapperClassName="min-h-[300px] max-h-[40vh]"
                    />
                  ),
                  [WizardStep.ADD_OUTPUT]: () => (
                    <ConnectTiles
                      key="output-connector-tiles"
                      componentTypeFilter={['output']}
                      onChange={handleOutputChange}
                      defaultConnectionName={persistedConnector.output?.connectionName}
                      defaultConnectionType={persistedConnector.output?.connectionType}
                      ref={addOutputStepRef}
                      title="Read data from your pipeline"
                      tileWrapperClassName="min-h-[300px] max-h-[40vh]"
                    />
                  ),
                  // TODO add persisted data to both steps
                  [WizardStep.ADD_TOPIC]: () => <AddTopicStep ref={addTopicStepRef} topicList={topicList.topics} />,
                  [WizardStep.ADD_USER]: () => <AddUserStep ref={addUserStepRef} usersList={usersList?.users} />,
                })}
              </div>
              <Stepper.Controls className={cn(!methods.isFirst && 'justify-between')}>
                {!methods.isFirst && (
                  <Button type="button" variant="secondary" onClick={methods.prev}>
                    Previous
                  </Button>
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={handleSkip}>
                    Skip
                  </Button>
                  {(methods.current.id === WizardStep.ADD_INPUT &&
                    persistedConnector.input?.connectionName &&
                    persistedConnector.input?.connectionType) ||
                  (methods.current.id === WizardStep.ADD_OUTPUT &&
                    persistedConnector.output?.connectionName &&
                    persistedConnector.output?.connectionType) ||
                  methods.current.id === WizardStep.ADD_TOPIC ||
                  methods.current.id === WizardStep.ADD_USER ? (
                    <Button onClick={() => handleNext(methods)} disabled={isCurrentStepLoading}>
                      {isCurrentStepLoading ? 'Loading...' : 'Next'}
                    </Button>
                  ) : null}
                </div>
              </Stepper.Controls>
            </div>
          );
        }}
      </Stepper.Provider>
    </PageContent>
  );
};
