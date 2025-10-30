import { create } from '@bufbuild/protobuf';
import PageContent from 'components/misc/page-content';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Heading } from 'components/redpanda-ui/components/typography';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { runInAction } from 'mobx';
import { AnimatePresence } from 'motion/react';
import { ListTopicsRequestSchema } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import { useListUsersQuery } from 'react-query/api/user';
import { LONG_LIVED_CACHE_STALE_TIME } from 'react-query/react-query.utils';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useOnboardingTopicDataStore,
  useOnboardingUserDataStore,
  useOnboardingWizardDataStore,
  useOnboardingYamlContentStore,
  useResetOnboardingWizardStore,
} from 'state/onboarding-wizard-store';
import { uiState } from 'state/ui-state';
import { useShallow } from 'zustand/react/shallow';

import { AddTopicStep } from './add-topic-step';
import { AddUserStep } from './add-user-step';
import { ConnectTiles } from './connect-tiles';
import RpConnectPipelinesCreate from '../pipelines-create';
import {
  REDPANDA_TOPIC_AND_USER_COMPONENTS,
  stepMotionProps,
  WizardStep,
  WizardStepper,
  type WizardStepperSteps,
  type WizardStepType,
  wizardStepDefinitions,
} from '../types/constants';
import type { ExtendedConnectComponentSpec } from '../types/schema';
import type { AddTopicFormData, AddUserFormData, BaseStepRef, ConnectTilesListFormData } from '../types/wizard';
import { handleStepResult, regenerateYamlForTopicUserComponents } from '../utils/wizard';
import { getConnectTemplate } from '../utils/yaml';

export type ConnectOnboardingWizardProps = {
  className?: string;
  additionalComponents?: ExtendedConnectComponentSpec[];
  onChange?: (connectorName: string, connectorType: string) => void;
  onCancel?: () => void;
};

export const ConnectOnboardingWizard = ({
  className,
  additionalComponents = [
    {
      name: 'custom',
      type: 'custom',
      plugin: false,
    },
  ],
  onChange,
  onCancel: onCancelProp,
}: ConnectOnboardingWizardProps = {}) => {
  const navigate = useNavigate();

  const persistedInputConnectionName = useOnboardingWizardDataStore(useShallow((state) => state.input?.connectionName));
  const persistedOutputConnectionName = useOnboardingWizardDataStore(
    useShallow((state) => state.output?.connectionName)
  );
  const persistedTopicName = useOnboardingTopicDataStore(useShallow((state) => state.topicName));
  const persistedUserSaslMechanism = useOnboardingUserDataStore(useShallow((state) => state.saslMechanism));
  const persistedUsername = useOnboardingUserDataStore(useShallow((state) => state.username));
  const resetOnboardingWizardStore = useResetOnboardingWizardStore();
  const setWizardData = useOnboardingWizardDataStore(useShallow((state) => state.setWizardData));
  const setTopicData = useOnboardingTopicDataStore(useShallow((state) => state.setTopicData));
  const setUserData = useOnboardingUserDataStore(useShallow((state) => state.setUserData));

  const persistedInputHasTopicAndUser = useMemo(
    () => persistedInputConnectionName && REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(persistedInputConnectionName),
    [persistedInputConnectionName]
  );

  useEffect(() => {
    return () => {
      // Only clear if we're navigating away from the wizard
      const currentPath = window.location.pathname;
      if (!currentPath.includes('/rp-connect/wizard')) {
        resetOnboardingWizardStore();
      }
    };
  }, [resetOnboardingWizardStore]);

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

  const addInputStepRef = useRef<BaseStepRef<ConnectTilesListFormData>>(null);
  const addOutputStepRef = useRef<BaseStepRef<ConnectTilesListFormData>>(null);
  const addTopicStepRef = useRef<BaseStepRef<AddTopicFormData>>(null);
  const addUserStepRef = useRef<BaseStepRef<AddUserFormData>>(null);

  const { data: topicList } = useLegacyListTopicsQuery(create(ListTopicsRequestSchema, {}), {
    hideInternalTopics: true,
    staleTime: LONG_LIVED_CACHE_STALE_TIME,
    refetchOnWindowFocus: false,
  });
  const { data: usersList } = useListUsersQuery(undefined, {
    staleTime: LONG_LIVED_CACHE_STALE_TIME,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    runInAction(() => {
      uiState.pageTitle = 'Create Pipeline';
      uiState.pageBreadcrumbs = [
        { title: 'Redpanda Connect', linkTo: '/connect-clusters' },
        { title: 'Create Pipeline', linkTo: '' },
      ];
    });
  }, []);

  const handleSkipToCreatePipeline = (methods: WizardStepperSteps) => {
    if (methods.current.id === WizardStep.ADD_INPUT) {
      resetOnboardingWizardStore();
    } else if (methods.current.id === WizardStep.ADD_OUTPUT) {
      const { setWizardData: _, ...currentWizardData } = useOnboardingWizardDataStore.getState();
      setWizardData({
        input: currentWizardData.input,
        output: {},
      });
      setTopicData({});
      setUserData({});
    }
    methods.goTo(WizardStep.CREATE_CONFIG);
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: helpers to reduce complexity wouldn't apply here
  const handleNext = async (methods: WizardStepperSteps) => {
    switch (methods.current.id) {
      case WizardStep.ADD_INPUT: {
        const result = await addInputStepRef.current?.triggerSubmit();
        const connectionName = result?.data?.connectionName;
        const connectionType = result?.data?.connectionType;

        if (connectionType === 'custom') {
          handleSkipToCreatePipeline(methods);
          return;
        }
        if (result?.success && connectionName && connectionType) {
          const yamlContent = getConnectTemplate({
            connectionName,
            connectionType,
            showOptionalFields: false,
            existingYaml: useOnboardingYamlContentStore.getState().yamlContent,
          });

          if (yamlContent) {
            useOnboardingYamlContentStore.getState().setYamlContent({ yamlContent });
          }

          if (connectionName === 'redpanda_common') {
            setWizardData({
              input: {
                connectionName,
                connectionType,
              },
              output: {
                connectionName,
                connectionType: 'output',
              },
            });
            methods.goTo(WizardStep.ADD_TOPIC);
          } else {
            const { setWizardData: _, ...currentWizardData } = useOnboardingWizardDataStore.getState();
            setWizardData({
              input: {
                connectionName,
                connectionType,
              },
              ...(currentWizardData.output && { output: currentWizardData.output }),
            });
            methods.next();
          }
          onChange?.(connectionName, connectionType);
        }
        break;
      }
      case WizardStep.ADD_OUTPUT: {
        const result = await addOutputStepRef.current?.triggerSubmit();
        const connectionName = result?.data?.connectionName;
        const connectionType = result?.data?.connectionType;

        if (connectionType === 'custom') {
          handleSkipToCreatePipeline(methods);
          return;
        }

        if (result?.success && connectionName && connectionType) {
          const yamlContent = getConnectTemplate({
            connectionName,
            connectionType,
            showOptionalFields: false,
            existingYaml: useOnboardingYamlContentStore.getState().yamlContent,
          });

          if (yamlContent) {
            useOnboardingYamlContentStore.getState().setYamlContent({ yamlContent });
          }

          if (connectionName === 'redpanda_common') {
            setWizardData({
              input: {
                connectionName,
                connectionType: 'input',
              },
              output: {
                connectionName,
                connectionType,
              },
            });
          } else {
            const { setWizardData: _, ...currentWizardData } = useOnboardingWizardDataStore.getState();
            setWizardData({
              output: {
                connectionName,
                connectionType,
              },
              ...(currentWizardData.input && { input: currentWizardData.input }),
            });
          }
          onChange?.(connectionName, connectionType);
          const outputNeedsTopicAndUser = REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(connectionName);
          if (persistedInputHasTopicAndUser || outputNeedsTopicAndUser) {
            methods.next();
          } else {
            methods.goTo(WizardStep.CREATE_CONFIG);
          }
        }
        break;
      }
      case WizardStep.ADD_TOPIC: {
        const result = await addTopicStepRef.current?.triggerSubmit();
        if (result?.success && result.data) {
          setTopicData({ topicName: result.data.topicName });
          regenerateYamlForTopicUserComponents();
        }
        handleStepResult(result, methods.next);
        break;
      }
      case WizardStep.ADD_USER: {
        const result = await addUserStepRef.current?.triggerSubmit();
        if (result?.success && result.data) {
          setUserData({
            username: result.data.username,
            saslMechanism: result.data.saslMechanism,
          });
          regenerateYamlForTopicUserComponents();
        }
        handleStepResult(result, methods.next);
        break;
      }
      default:
        methods.next();
    }
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
    resetOnboardingWizardStore();
    if (onCancelProp) {
      onCancelProp();
    } else if (searchParams.get('serverless') === 'true') {
      navigate('/overview');
    } else {
      navigate('/connect-clusters');
    }
  }, [onCancelProp, navigate, resetOnboardingWizardStore, searchParams]);

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
                      <WizardStepper.Step
                        icon={
                          wizardStepDefinitions.findIndex((s) => s.id === step.id) <
                          wizardStepDefinitions.findIndex((s) => s.id === methods.current.id) ? (
                            <CheckIcon className="text-white" size={16} />
                          ) : undefined
                        }
                        key={step.id}
                        of={step.id}
                        onClick={() => methods.goTo(step.id)}
                      >
                        <WizardStepper.Title>{step.title}</WizardStepper.Title>
                      </WizardStepper.Step>
                    ))}
                  </WizardStepper.Navigation>
                </div>
                <AnimatePresence mode="wait">
                  {methods.switch({
                    [WizardStep.ADD_INPUT]: () => (
                      <ConnectTiles
                        {...stepMotionProps}
                        additionalComponents={additionalComponents}
                        componentTypeFilter={['input', 'custom']}
                        defaultConnectionName={persistedInputConnectionName}
                        defaultConnectionType="input"
                        key={`input-connector-tiles-${persistedInputConnectionName || 'empty'}`}
                        ref={addInputStepRef}
                        tileWrapperClassName="min-h-[300px] max-h-[35vh]"
                        title="Stream data to your pipeline"
                      />
                    ),
                    [WizardStep.ADD_OUTPUT]: () => (
                      <ConnectTiles
                        {...stepMotionProps}
                        additionalComponents={additionalComponents}
                        componentTypeFilter={['output', 'custom']}
                        defaultConnectionName={persistedOutputConnectionName}
                        defaultConnectionType="output"
                        key={`output-connector-tiles-${persistedOutputConnectionName || 'empty'}`}
                        ref={addOutputStepRef}
                        tileWrapperClassName="min-h-[300px] max-h-[35vh]"
                        title="Stream data from your pipeline"
                      />
                    ),
                    [WizardStep.ADD_TOPIC]: () => (
                      <AddTopicStep
                        {...stepMotionProps}
                        defaultTopicName={persistedTopicName}
                        key="add-topic-step"
                        ref={addTopicStepRef}
                        topicList={topicList.topics}
                      />
                    ),
                    [WizardStep.ADD_USER]: () => (
                      <AddUserStep
                        {...stepMotionProps}
                        defaultSaslMechanism={persistedUserSaslMechanism}
                        defaultUsername={persistedUsername}
                        key="add-user-step"
                        ref={addUserStepRef}
                        topicName={persistedTopicName}
                        usersList={usersList?.users ?? []}
                      />
                    ),
                    [WizardStep.CREATE_CONFIG]: () => (
                      <Card key="create-config-step" size="full" {...stepMotionProps} animated>
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
                </AnimatePresence>
              </div>
              <WizardStepper.Controls className="justify-between">
                <div className="flex gap-2">
                  {!(methods.isFirst || methods.isLast) && (
                    <Button onClick={methods.prev} type="button" variant="secondary">
                      <ChevronLeftIcon />
                      Previous
                    </Button>
                  )}
                  {!methods.isLast && (
                    <Button onClick={handleCancel} type="button" variant="outline">
                      Cancel
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  {!methods.isLast && (
                    <Button onClick={() => methods.next()} type="button" variant="outline">
                      Skip
                    </Button>
                  )}
                  {!methods.isLast && (
                    <Button disabled={isCurrentStepLoading} onClick={() => handleNext(methods)}>
                      {isCurrentStepLoading ? 'Loading...' : 'Next'} <ChevronRightIcon />
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
