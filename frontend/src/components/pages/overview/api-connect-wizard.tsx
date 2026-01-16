import { TransportProvider } from '@connectrpc/connect-query';
import { Markdown } from '@redpanda-data/ui';
import { useNavigate } from '@tanstack/react-router';
import PageContent from 'components/misc/page-content';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { defineStepper } from 'components/redpanda-ui/components/stepper';
import { Heading } from 'components/redpanda-ui/components/typography';
import { config } from 'config';
import { useControlplaneTransport } from 'hooks/use-controlplane-transport';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { runInAction } from 'mobx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGetOnboardingCodeSnippetQuery } from 'react-query/api/onboarding';
import { useGetServerlessClusterQuery } from 'react-query/api/serverless';
import { useAPIWizardStore } from 'state/api-wizard-store';
import { uiState } from 'state/ui-state';
import { capitalizeFirst } from 'utils/utils';
import { useShallow } from 'zustand/react/shallow';

import { AddTopicStep } from '../rp-connect/onboarding/add-topic-step';
import { AddUserStep } from '../rp-connect/onboarding/add-user-step';
import type { AddTopicFormData, BaseStepRef, UserStepRef } from '../rp-connect/types/wizard';
import { handleStepResult } from '../rp-connect/utils/wizard';

const APIWizardStep = {
  ADD_DATA: 'add-data-step',
  ADD_TOPIC: 'add-topic-step',
  ADD_USER: 'add-user-step',
  CONNECT_CLUSTER: 'connect-cluster-step',
};

const apiWizardStepDefinitions = [
  { id: APIWizardStep.ADD_DATA, title: 'Add data' },
  { id: APIWizardStep.ADD_TOPIC, title: 'Add a topic' },
  { id: APIWizardStep.ADD_USER, title: 'Add a user' },
  { id: APIWizardStep.CONNECT_CLUSTER, title: 'Connect cluster' },
];

const APIStepper = defineStepper(...apiWizardStepDefinitions);

const APIWizardStepper = APIStepper.Stepper;
type APIWizardStepperSteps = typeof APIStepper.Steps;

type HowToConnectProps = {
  topicName?: string;
  username?: string;
  saslMechanism?: string;
};

const HowToConnectComponent = ({ topicName, username, saslMechanism }: HowToConnectProps) => {
  const connectionName = useAPIWizardStore(useShallow((state) => state.connectionName));
  const { data: codeSnippet, isLoading: isLoadingCodeSnippet } = useGetOnboardingCodeSnippetQuery({
    language: connectionName,
  });
  const { data: cluster } = useGetServerlessClusterQuery({
    id: config.clusterId,
  });

  const bootstrapServerUrl = cluster?.serverlessCluster?.kafkaApi?.seedBrokers.join(',') as string;

  const formattedCodeSnippet = useMemo(() => {
    let codeSnippetWithVariables = codeSnippet;
    if (bootstrapServerUrl) {
      codeSnippetWithVariables = codeSnippetWithVariables?.replaceAll('<bootstrap-server-address>', bootstrapServerUrl);
    }
    if (topicName) {
      codeSnippetWithVariables = codeSnippetWithVariables?.replaceAll('demo-topic', topicName);
    }
    if (username) {
      codeSnippetWithVariables = codeSnippetWithVariables?.replaceAll('<username>', username);
    }
    if (saslMechanism) {
      codeSnippetWithVariables = codeSnippetWithVariables
        ?.replaceAll('<scram-sha-256 or scram-sha-512>', saslMechanism)
        ?.replaceAll('<SCRAM-SHA-256 or SCRAM-SHA-512>', saslMechanism);
    }
    return codeSnippetWithVariables;
  }, [codeSnippet, bootstrapServerUrl, topicName, username, saslMechanism]);

  const content = useMemo(() => {
    if (isLoadingCodeSnippet) {
      return (
        <div className="flex items-center justify-center p-8">
          <div className="text-muted-foreground">Loading code snippet...</div>
        </div>
      );
    }
    if (formattedCodeSnippet) {
      return <Markdown showLineNumbers>{formattedCodeSnippet}</Markdown>;
    }
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">No code snippet found</div>
      </div>
    );
  }, [isLoadingCodeSnippet, formattedCodeSnippet]);

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
      <CardContent className="relative flex max-h-[50vh] min-h-[400px] gap-8 overflow-y-auto">
        <div className="max-w-4xl rounded-md border border-base-200 bg-slate-100 p-6">{content}</div>
      </CardContent>
    </Card>
  );
};

const HowToConnectStep = ({ topicName, username, saslMechanism }: HowToConnectProps) => {
  const controlplaneTransport = useControlplaneTransport();
  return (
    <TransportProvider transport={controlplaneTransport}>
      <HowToConnectComponent saslMechanism={saslMechanism} topicName={topicName} username={username} />
    </TransportProvider>
  );
};

export const APIConnectWizard = () => {
  const navigate = useNavigate();
  const { reset: resetApiWizardStore } = useAPIWizardStore();
  const [topicName, setTopicName] = useState<string | undefined>(undefined);
  const [username, setUsername] = useState<string | undefined>(undefined);
  const [saslMechanism, setSaslMechanism] = useState<string | undefined>(undefined);

  const addTopicStepRef = useRef<BaseStepRef<AddTopicFormData>>(null);
  const addUserStepRef = useRef<UserStepRef>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNext = async (methods: APIWizardStepperSteps) => {
    switch (methods.current.id) {
      case APIWizardStep.ADD_TOPIC: {
        setIsSubmitting(true);
        try {
          const result = await addTopicStepRef.current?.triggerSubmit();
          if (result?.success) {
            setTopicName(result.data?.topicName);
          }
          handleStepResult(result, methods.next);
        } finally {
          setIsSubmitting(false);
        }
        break;
      }
      case APIWizardStep.ADD_USER: {
        setIsSubmitting(true);
        try {
          const result = await addUserStepRef.current?.triggerSubmit();
          if (result?.success && result.data && 'username' in result.data) {
            // SASL user data
            setUsername(result.data.username);
            setSaslMechanism(result.data.saslMechanism);
          }
          // Service account data doesn't set username/saslMechanism
          handleStepResult(result, methods.next);
        } finally {
          setIsSubmitting(false);
        }
        break;
      }
      default:
        methods.next();
    }
  };

  const handleSkip = (methods: APIWizardStepperSteps) => {
    methods.next();
  };

  const handleCancel = useCallback(() => {
    resetApiWizardStore();
    navigate({ to: '/overview' });
    window.location.reload(); // Required because we want to load Cloud UI's overview, not Console UI.
  }, [navigate, resetApiWizardStore]);

  useEffect(() => {
    runInAction(() => {
      uiState.pageTitle = 'Connect to your cluster';
      uiState.pageBreadcrumbs = [
        { title: 'Cluster Overview', linkTo: '/overview' },
        { title: 'Connect to your cluster', linkTo: '' },
      ];
    });
  }, []);

  useEffect(() => {
    useAPIWizardStore.persist.rehydrate();
    return () => {
      // Only clear if we're not on the get-started/api route (user navigated away)
      const currentPath = window.location.pathname;
      if (!currentPath.includes('/get-started/api')) {
        resetApiWizardStore();
      }
    };
  }, [resetApiWizardStore]);

  const handleCreate = useCallback(() => {
    resetApiWizardStore();
    navigate({ to: '/overview' });
    window.location.reload(); // Required because we want to load Cloud UI's overview, not Console UI.
  }, [navigate, resetApiWizardStore]);

  return (
    <PageContent>
      <APIWizardStepper.Provider className="space-y-2" initialStep={APIWizardStep.ADD_TOPIC}>
        {({ methods }) => (
          <div className="relative flex flex-col gap-6">
            <div className="flex h-full flex-col gap-6 pt-4">
              <div className="flex flex-col space-y-2 text-center">
                <APIWizardStepper.Navigation>
                  {apiWizardStepDefinitions.map((step) => (
                    <APIWizardStepper.Step
                      key={step.id}
                      of={step.id}
                      onClick={() => {
                        if (step.id === APIWizardStep.ADD_DATA) {
                          window.location.href = '/get-started?type=input'; // Required because we want to load Cloud UI's get-started page.
                        } else {
                          methods.goTo(step.id);
                        }
                      }}
                    >
                      <APIWizardStepper.Title>{step.title}</APIWizardStepper.Title>
                    </APIWizardStepper.Step>
                  ))}
                </APIWizardStepper.Navigation>
              </div>
              {methods.switch({
                [APIWizardStep.ADD_TOPIC]: () => <AddTopicStep defaultTopicName={topicName} ref={addTopicStepRef} />,
                [APIWizardStep.ADD_USER]: () => (
                  <AddUserStep defaultUsername={username} ref={addUserStepRef} topicName={topicName} />
                ),
                [APIWizardStep.CONNECT_CLUSTER]: () => (
                  <HowToConnectStep saslMechanism={saslMechanism} topicName={topicName} username={username} />
                ),
              })}
            </div>
            <APIWizardStepper.Controls className="justify-between">
              <div className="flex gap-2">
                {!(methods.isFirst || methods.isLast) && (
                  <Button
                    onClick={
                      methods.current.id === APIWizardStep.ADD_TOPIC
                        ? () => {
                            window.location.href = '/get-started?type=input';
                          }
                        : methods.prev
                    }
                    type="button"
                    variant="secondary"
                  >
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

                {methods.isLast ? (
                  <Button onClick={handleCreate} type="button">
                    Create
                  </Button>
                ) : (
                  <Button className="min-w-[70px]" disabled={isSubmitting} onClick={() => handleNext(methods)}>
                    {isSubmitting ? (
                      <Spinner />
                    ) : (
                      <>
                        Next <ChevronRightIcon />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </APIWizardStepper.Controls>
          </div>
        )}
      </APIWizardStepper.Provider>
    </PageContent>
  );
};
