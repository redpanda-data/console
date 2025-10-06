import { create } from '@bufbuild/protobuf';
import PageContent from 'components/misc/PageContent';
import { Button } from 'components/redpanda-ui/components/button';
import { defineStepper } from 'components/redpanda-ui/components/stepper';
import { cn } from 'components/redpanda-ui/lib/utils';
import { isServerless } from 'config';
import { useSessionStorage } from 'hooks/use-session-storage';
import { ListTopicsRequestSchema } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { useCallback, useMemo, useRef } from 'react';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import { useLegacyListUsersQuery } from 'react-query/api/user';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CONNECT_WIZARD_CONNECTOR_KEY } from 'state/connect/state';

import { AddTopicStep } from './add-topic-step';
import { AddUserStep } from './add-user-step';
import { ConnectTiles } from './connect-tiles';
import type { ConnectComponentType } from '../types/schema';
import type { BaseStepRef, ConnectTilesFormData } from '../types/wizard';
import { handleStepResult, WizardStep } from '../utils/wizard';

const stepDefinitions = [
  {
    id: WizardStep.ADD_CONNECTOR,
    title: 'Connect Your Data',
  },
  { id: WizardStep.ADD_TOPIC, title: 'Add a Topic' },
  { id: WizardStep.ADD_USER, title: 'Add a User' },
];

const { Stepper } = defineStepper(...stepDefinitions);

export const ConnectOnboardingWizard = () => {
  const [persistedConnector, setPersistedConnector] = useSessionStorage<Partial<ConnectTilesFormData>>(
    CONNECT_WIZARD_CONNECTOR_KEY,
    {},
  );

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialStep = useMemo(() => {
    const isServerlessOnboardingWizard =
      isServerless() &&
      searchParams.get('serverless') === 'true' &&
      persistedConnector.connectionName &&
      persistedConnector.connectionType;
    const isRedirectFromEmptyPipelinesList = isServerless() && searchParams.get('step') === 'add-topic';
    return isServerlessOnboardingWizard || isRedirectFromEmptyPipelinesList
      ? WizardStep.ADD_TOPIC
      : WizardStep.ADD_CONNECTOR;
  }, [searchParams, persistedConnector]);

  const addConnectorStepRef = useRef<BaseStepRef>(null);
  const addTopicStepRef = useRef<BaseStepRef>(null);
  const addUserStepRef = useRef<BaseStepRef>(null);

  const { data: topicList } = useLegacyListTopicsQuery(create(ListTopicsRequestSchema, {}), {
    hideInternalTopics: true,
  });
  const { data: usersList } = useLegacyListUsersQuery();

  const handleConnectorChange = useCallback(
    (connectionName: string, connectionType: ConnectComponentType) => {
      setPersistedConnector({ connectionName, connectionType });
    },
    [setPersistedConnector],
  );

  const handleNext = async (methods: { current: { id: WizardStep }; next: () => void }) => {
    switch (methods.current.id) {
      case WizardStep.ADD_CONNECTOR: {
        const result = await addConnectorStepRef.current?.triggerSubmit();
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

  return (
    <PageContent>
      <Stepper.Provider className="space-y-4" initialStep={initialStep}>
        {({ methods }) => (
          <div className="flex flex-col gap-8 relative">
            <div className="flex flex-col gap-8 pt-6 h-full">
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
                [WizardStep.ADD_CONNECTOR]: () => (
                  <ConnectTiles
                    componentTypeFilter={['input', 'output']}
                    defaultConnectionName={persistedConnector.connectionName}
                    defaultConnectionType={persistedConnector.connectionType}
                    onChange={handleConnectorChange}
                    ref={addConnectorStepRef}
                  />
                ),
                // TODO add persisted data to both steps
                [WizardStep.ADD_TOPIC]: () => <AddTopicStep ref={addTopicStepRef} topicList={topicList.topics} />,
                [WizardStep.ADD_USER]: () => <AddUserStep ref={addUserStepRef} usersList={usersList?.users} />,
              })}
            </div>
            <Stepper.Controls className={cn(!methods.isFirst && 'justify-between')}>
              {!methods.isFirst && (
                <Button onClick={methods.prev} type="button" variant="secondary">
                  Previous
                </Button>
              )}
              <div className="flex gap-2">
                <Button onClick={handleSkip} type="button" variant="outline">
                  Skip
                </Button>

                {(methods.isFirst && persistedConnector.connectionName && persistedConnector.connectionType) ||
                !methods.isFirst ? (
                  <Button onClick={() => handleNext(methods)}>Next</Button>
                ) : null}
              </div>
            </Stepper.Controls>
          </div>
        )}
      </Stepper.Provider>
    </PageContent>
  );
};
