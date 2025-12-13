import { create } from '@bufbuild/protobuf';
import PageContent from 'components/misc/page-content';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Heading } from 'components/redpanda-ui/components/typography';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { runInAction } from 'mobx';
import { AnimatePresence } from 'motion/react';
import { ComponentSpecSchema } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useListComponentsQuery } from 'react-query/api/connect';
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
import PipelinePage from '../pipeline';
import {
  REDPANDA_TOPIC_AND_USER_COMPONENTS,
  stepMotionProps,
  WizardStep,
  WizardStepper,
  type WizardStepperSteps,
  wizardStepDefinitions,
} from '../types/constants';
import type { ExtendedConnectComponentSpec } from '../types/schema';
import type { AddTopicFormData, BaseStepRef, ConnectTilesListFormData, UserStepRef } from '../types/wizard';
import { parseSchema } from '../utils/schema';
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
    create(ComponentSpecSchema, {
      name: 'custom',
      type: 'custom',
      status: 0,
      summary: 'Build your own pipeline from scratch.',
      description: '',
      categories: [],
      version: '',
      examples: [],
      footnotes: '',
    }) as ExtendedConnectComponentSpec,
  ],
  onChange,
  onCancel: onCancelProp,
}: ConnectOnboardingWizardProps = {}) => {
  const navigate = useNavigate();

  const { data: componentListResponse, isLoading: isComponentListLoading } = useListComponentsQuery();
  const components = useMemo(
    () => (componentListResponse?.components ? parseSchema(componentListResponse.components) : []),
    [componentListResponse]
  );

  const persistedInputConnectionName = useOnboardingWizardDataStore(useShallow((state) => state.input?.connectionName));
  const persistedOutputConnectionName = useOnboardingWizardDataStore(
    useShallow((state) => state.output?.connectionName)
  );
  const persistedTopicName = useOnboardingTopicDataStore(useShallow((state) => state.topicName));
  const persistedUserSaslMechanism = useOnboardingUserDataStore(useShallow((state) => state.saslMechanism));
  const persistedUsername = useOnboardingUserDataStore(useShallow((state) => state.username));
  const persistedConsumerGroup = useOnboardingUserDataStore(useShallow((state) => state.consumerGroup));
  const resetOnboardingWizardStore = useResetOnboardingWizardStore();
  const setWizardData = useOnboardingWizardDataStore(useShallow((state) => state.setWizardData));
  const setTopicData = useOnboardingTopicDataStore(useShallow((state) => state.setTopicData));
  const setUserData = useOnboardingUserDataStore(useShallow((state) => state.setUserData));

  const persistedInputIsRedpandaComponent = useMemo<boolean>(
    () =>
      Boolean(persistedInputConnectionName) &&
      REDPANDA_TOPIC_AND_USER_COMPONENTS.includes(persistedInputConnectionName ?? ''),
    [persistedInputConnectionName]
  );

  useEffect(() => {
    const store = useOnboardingWizardDataStore;
    store.persist.rehydrate();
  }, []);

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
  const addUserStepRef = useRef<UserStepRef>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Track form validity for each step
  const [stepValidity, setStepValidity] = useState<Record<string, boolean>>({
    [WizardStep.ADD_INPUT]: false,
    [WizardStep.ADD_OUTPUT]: false,
    [WizardStep.ADD_TOPIC]: false,
    [WizardStep.ADD_USER]: false,
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
            components,
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
            components,
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
          if (persistedInputIsRedpandaComponent || outputNeedsTopicAndUser) {
            methods.next();
          } else {
            methods.goTo(WizardStep.CREATE_CONFIG);
          }
        }
        break;
      }
      case WizardStep.ADD_TOPIC: {
        setIsSubmitting(true);
        try {
          const result = await addTopicStepRef.current?.triggerSubmit();
          if (result?.success && result.data) {
            setTopicData({ topicName: result.data.topicName });
            regenerateYamlForTopicUserComponents(components);
          }
          handleStepResult(result, methods.next);
        } finally {
          setIsSubmitting(false);
        }
        break;
      }
      case WizardStep.ADD_USER: {
        setIsSubmitting(true);
        try {
          const result = await addUserStepRef.current?.triggerSubmit();
          if (result?.success && result.data) {
            setUserData({
              username: result.data.username,
              saslMechanism: result.data.saslMechanism,
              consumerGroup: result.data.consumerGroup || '',
            });
            regenerateYamlForTopicUserComponents(components);
            methods.next();
          }
        } finally {
          setIsSubmitting(false);
        }
        break;
      }
      default:
        methods.next();
    }
  };

  const handleCancel = useCallback(() => {
    resetOnboardingWizardStore();
    if (onCancelProp) {
      onCancelProp();
    } else if (searchParams.get('serverless') === 'true') {
      navigate('/overview');
      window.location.reload(); // Required because we want to load Cloud UI's overview, not Console UI.
    } else {
      navigate('/connect-clusters');
    }
  }, [onCancelProp, navigate, resetOnboardingWizardStore, searchParams]);

  // Callbacks to update validity for each step
  const handleInputValidityChange = useCallback((isValid: boolean) => {
    setStepValidity((prev) => ({ ...prev, [WizardStep.ADD_INPUT]: isValid }));
  }, []);

  const handleOutputValidityChange = useCallback((isValid: boolean) => {
    setStepValidity((prev) => ({ ...prev, [WizardStep.ADD_OUTPUT]: isValid }));
  }, []);

  const handleTopicValidityChange = useCallback((isValid: boolean) => {
    setStepValidity((prev) => ({ ...prev, [WizardStep.ADD_TOPIC]: isValid }));
  }, []);

  const handleUserValidityChange = useCallback((isValid: boolean) => {
    setStepValidity((prev) => ({ ...prev, [WizardStep.ADD_USER]: isValid }));
  }, []);

  return (
    <PageContent className={className}>
      <WizardStepper.Provider className="space-y-2" initialStep={initialStep}>
        {({ methods }) => (
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
                      components={componentListResponse?.components}
                      isLoading={isComponentListLoading}
                      {...stepMotionProps}
                      additionalComponents={additionalComponents}
                      componentTypeFilter={['input', 'custom']}
                      defaultConnectionName={persistedInputConnectionName}
                      defaultConnectionType="input"
                      key={`input-connector-tiles-${persistedInputConnectionName || 'empty'}`}
                      onValidityChange={handleInputValidityChange}
                      ref={addInputStepRef}
                      tileWrapperClassName="min-h-[300px] max-h-[35vh]"
                      title="Stream data to your pipeline"
                    />
                  ),
                  [WizardStep.ADD_OUTPUT]: () => (
                    <ConnectTiles
                      components={componentListResponse?.components}
                      isLoading={isComponentListLoading}
                      {...stepMotionProps}
                      additionalComponents={additionalComponents}
                      componentTypeFilter={['output', 'custom']}
                      defaultConnectionName={persistedOutputConnectionName}
                      defaultConnectionType="output"
                      key={`output-connector-tiles-${persistedOutputConnectionName || 'empty'}`}
                      onValidityChange={handleOutputValidityChange}
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
                      onValidityChange={handleTopicValidityChange}
                      ref={addTopicStepRef}
                    />
                  ),
                  [WizardStep.ADD_USER]: () => (
                    <AddUserStep
                      {...stepMotionProps}
                      defaultConsumerGroup={persistedConsumerGroup}
                      defaultSaslMechanism={persistedUserSaslMechanism}
                      defaultUsername={persistedUsername}
                      key="add-user-step"
                      onValidityChange={handleUserValidityChange}
                      ref={addUserStepRef}
                      showConsumerGroupFields={persistedInputIsRedpandaComponent}
                      topicName={persistedTopicName}
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
                        <PipelinePage />
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
                  <Button
                    className="min-w-[70px]"
                    disabled={isSubmitting || !stepValidity[methods.current.id]}
                    onClick={() => handleNext(methods)}
                  >
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
            </WizardStepper.Controls>
          </div>
        )}
      </WizardStepper.Provider>
    </PageContent>
  );
};
