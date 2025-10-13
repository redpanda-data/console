import { create } from '@bufbuild/protobuf';
import PageContent from 'components/misc/page-content';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { defineStepper } from 'components/redpanda-ui/components/stepper';
import { Heading } from 'components/redpanda-ui/components/typography';
import { useSessionStorage } from 'hooks/use-session-storage';
import { ChevronLeftIcon } from 'lucide-react';
import { ListTopicsRequestSchema } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { useCallback, useRef } from 'react';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import { useLegacyListUsersQuery } from 'react-query/api/user';
import { useNavigate } from 'react-router-dom';

import { AddTopicStep } from '../rp-connect/onboarding/add-topic-step';
import { AddUserStep } from '../rp-connect/onboarding/add-user-step';
import type { AddTopicFormData, AddUserFormData, BaseStepRef } from '../rp-connect/types/wizard';
import { handleStepResult } from '../rp-connect/utils/wizard';

const API_CONNECT_WIZARD_KEY = 'kafka-api-wizard';

export const APIWizardStep = {
  ADD_TOPIC: 'add-topic-step',
  ADD_USER: 'add-user-step',
  CONNECT_CLUSTER: 'connect-cluster-step',
};
export type APIWizardStepType = (typeof APIWizardStep)[keyof typeof APIWizardStep];

export const apiWizardStepDefinitions = [
  { id: APIWizardStep.ADD_TOPIC, title: 'Add a topic' },
  { id: APIWizardStep.ADD_USER, title: 'Add a user' },
  { id: APIWizardStep.CONNECT_CLUSTER, title: 'Connect cluster' },
];

const APIStepper = defineStepper(...apiWizardStepDefinitions);

export const APIWizardStepper = APIStepper.Stepper;
export type APIWizardStepperSteps = typeof APIStepper.Steps;

type APIConnectWizardFormData = {
  topicName?: string;
  username?: string;
};

export type StepSubmissionResult = {
  success: boolean;
  message?: string;
  error?: string;
  data?: APIConnectWizardFormData;
};

export const APIConnectWizard = () => {
  const navigate = useNavigate();
  const [persistedAPIWizardData, setPersistedAPIWizardData] = useSessionStorage<APIConnectWizardFormData>(
    API_CONNECT_WIZARD_KEY,
    {}
  );

  const addTopicStepRef = useRef<BaseStepRef<AddTopicFormData>>(null);
  const addUserStepRef = useRef<BaseStepRef<AddUserFormData>>(null);

  const { data: topicList } = useLegacyListTopicsQuery(create(ListTopicsRequestSchema, {}), {
    hideInternalTopics: true,
  });
  const { data: usersList } = useLegacyListUsersQuery();

  const handleNext = async (methods: APIWizardStepperSteps) => {
    switch (methods.current.id) {
      case APIWizardStep.ADD_TOPIC: {
        const result = await addTopicStepRef.current?.triggerSubmit();
        if (result?.success) {
          setPersistedAPIWizardData({
            ...persistedAPIWizardData,
            topicName: result.data?.topicName,
          });
        }
        handleStepResult(result, methods.next);
        break;
      }
      case APIWizardStep.ADD_USER: {
        const result = await addUserStepRef.current?.triggerSubmit();
        if (result?.success) {
          setPersistedAPIWizardData({
            ...persistedAPIWizardData,
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

  const handleSkip = (methods: APIWizardStepperSteps) => {
    methods.next();
  };

  const getCurrentStepLoading = (currentStepId: APIWizardStepType): boolean => {
    switch (currentStepId) {
      case APIWizardStep.ADD_TOPIC:
        return addTopicStepRef.current?.isLoading ?? false;
      case APIWizardStep.ADD_USER:
        return addUserStepRef.current?.isLoading ?? false;
      default:
        return false;
    }
  };

  const handleCancel = useCallback(() => {
    navigate('/overview');
  }, [navigate]);

  return (
    <PageContent>
      <APIWizardStepper.Provider className="space-y-2">
        {({ methods }) => {
          const isCurrentStepLoading = getCurrentStepLoading(methods.current.id);

          return (
            <div className="relative flex flex-col gap-6">
              <div className="flex h-full flex-col gap-6 pt-4">
                <div className="flex flex-col space-y-2 text-center">
                  <APIWizardStepper.Navigation>
                    {apiWizardStepDefinitions.map((step) => (
                      <APIWizardStepper.Step key={step.id} of={step.id} onClick={() => methods.goTo(step.id)}>
                        <APIWizardStepper.Title>{step.title}</APIWizardStepper.Title>
                      </APIWizardStepper.Step>
                    ))}
                  </APIWizardStepper.Navigation>
                </div>
                {methods.switch({
                  [APIWizardStep.ADD_TOPIC]: () => <AddTopicStep ref={addTopicStepRef} topicList={topicList.topics} />,
                  [APIWizardStep.ADD_USER]: () => <AddUserStep ref={addUserStepRef} usersList={usersList?.users} />,
                  [APIWizardStep.CONNECT_CLUSTER]: () => (
                    <Card size="full">
                      <CardHeader>
                        <CardTitle>
                          <Heading level={2}>Connect to your cluster</Heading>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>{/* TODO: somehow show docs */}</CardContent>
                    </Card>
                  ),
                })}
              </div>
              <APIWizardStepper.Controls className="justify-between">
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
              </APIWizardStepper.Controls>
            </div>
          );
        }}
      </APIWizardStepper.Provider>
    </PageContent>
  );
};
