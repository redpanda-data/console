import { create } from '@bufbuild/protobuf';
import { Markdown } from '@redpanda-data/ui';
import PageContent from 'components/misc/page-content';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import { Group } from 'components/redpanda-ui/components/group';
import { Input } from 'components/redpanda-ui/components/input';
import { defineStepper } from 'components/redpanda-ui/components/stepper';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { useSessionStorage } from 'hooks/use-session-storage';
import { ChevronLeftIcon } from 'lucide-react';
import { runInAction } from 'mobx';
import { ListTopicsRequestSchema } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGetOnboardingCodeSnippetQuery } from 'react-query/api/onboarding';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import { useLegacyListUsersQuery } from 'react-query/api/user';
import { useNavigate } from 'react-router-dom';
import { uiState } from 'state/ui-state';
import { capitalizeFirst } from 'utils/utils';

import { AddTopicStep } from '../rp-connect/onboarding/add-topic-step';
import { AddUserStep } from '../rp-connect/onboarding/add-user-step';
import type { AddTopicFormData, AddUserFormData, BaseStepRef } from '../rp-connect/types/wizard';
import { handleStepResult } from '../rp-connect/utils/wizard';

const API_WIZARD_CONNECTOR_NAME_KEY = 'api-wizard-connector-name';

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
  connectionName?: string;
  topicName?: string;
  username?: string;
  saslMechanism?: string;
};

export type StepSubmissionResult = {
  success: boolean;
  message?: string;
  error?: string;
  data?: APIConnectWizardFormData;
};

const CopyableValue = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center gap-2">
    <Text className="w-36" variant="label">
      {label}
    </Text>
    <Group>
      <Input className="bg-accent text-muted-foreground" readOnly value={value} />
      <CopyButton className="bg-accent text-muted-foreground" content={value} size="icon" />
    </Group>
  </div>
);

const HowToConnectStep = ({ connectionName, topicName, username, saslMechanism }: APIConnectWizardFormData) => {
  const { data: codeSnippet, isLoading: isLoadingCodeSnippet } = useGetOnboardingCodeSnippetQuery({
    language: connectionName,
  });

  const content = useMemo(() => {
    if (isLoadingCodeSnippet) {
      return (
        <div className="flex items-center justify-center p-8">
          <div className="text-muted-foreground">Loading code snippet...</div>
        </div>
      );
    }
    if (codeSnippet) {
      return (
        <Markdown
          showLineNumbers
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {codeSnippet}
        </Markdown>
      );
    }
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">No code snippet found</div>
      </div>
    );
  }, [isLoadingCodeSnippet, codeSnippet]);

  return (
    <Card size="full">
      <CardHeader className="mb-2">
        <CardTitle>
          <Heading level={2}>Connect to your cluster</Heading>
        </CardTitle>
        <CardDescription>
          Follow the instructions below to connect to your cluster using the {capitalizeFirst(connectionName ?? '')}{' '}
          API.
        </CardDescription>
      </CardHeader>
      <CardContent className="relative flex gap-8">
        <div className="max-w-3xl rounded-md border border-base-200 bg-slate-100 p-8">{content}</div>
        {(topicName || username) && (
          <Card className="sticky top-0 left-0 flex h-fit flex-col gap-2">
            {topicName && <CopyableValue label="Topic" value={topicName} />}
            {username && <CopyableValue label="User" value={username} />}
            {saslMechanism && <CopyableValue label="SASL Mechanism" value={saslMechanism} />}
          </Card>
        )}
      </CardContent>
    </Card>
  );
};

export const APIConnectWizard = () => {
  const navigate = useNavigate();
  const [persistedAPIWizardData] = useSessionStorage<APIConnectWizardFormData>(API_WIZARD_CONNECTOR_NAME_KEY, {});
  const connectionName = useMemo(() => persistedAPIWizardData.connectionName, [persistedAPIWizardData.connectionName]);
  const [topicName, setTopicName] = useState<string | undefined>(undefined);
  const [username, setUsername] = useState<string | undefined>(undefined);
  const [saslMechanism, setSaslMechanism] = useState<string | undefined>(undefined);

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
          setTopicName(result.data?.topicName);
        }
        handleStepResult(result, methods.next);
        break;
      }
      case APIWizardStep.ADD_USER: {
        const result = await addUserStepRef.current?.triggerSubmit();
        if (result?.success) {
          setUsername(result.data?.username);
          setSaslMechanism(result.data?.saslMechanism);
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

  useEffect(() => {
    runInAction(() => {
      uiState.pageTitle = 'Connect to your cluster';
      uiState.pageBreadcrumbs = [
        { title: 'Cluster Overview', linkTo: '/overview' },
        { title: 'Connect to your cluster', linkTo: '' },
      ];
    });
  }, []);

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
                  [APIWizardStep.ADD_TOPIC]: () => (
                    <AddTopicStep defaultTopicName={topicName} ref={addTopicStepRef} topicList={topicList.topics} />
                  ),
                  [APIWizardStep.ADD_USER]: () => (
                    <AddUserStep
                      defaultUsername={username}
                      ref={addUserStepRef}
                      topicName={topicName}
                      usersList={usersList?.users}
                    />
                  ),
                  [APIWizardStep.CONNECT_CLUSTER]: () => (
                    <HowToConnectStep
                      connectionName={connectionName}
                      saslMechanism={saslMechanism}
                      topicName={topicName}
                      username={username}
                    />
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
