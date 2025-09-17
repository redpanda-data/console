import { create } from '@bufbuild/protobuf';
import { Sheet, SheetContent, SheetFooter, SheetHeader } from 'components/redpanda-ui/components/sheet';
import { memo, useCallback, useMemo, useRef } from 'react';
// TODO: add internationalization
// import { FormattedMessage } from 'react-intl';

import { Button } from 'components/redpanda-ui/components/button';
import { Toaster } from 'components/redpanda-ui/components/sonner';
import { defineStepper } from 'components/redpanda-ui/components/stepper';
import { Link } from 'components/redpanda-ui/components/typography';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import { useLegacyListUsersQuery } from 'react-query/api/user';
import { Link as ReactRouterLink, useLocation } from 'react-router-dom';
// import { useNavigate } from "react-router-dom";
import useOnboardingWizardStore, {} from 'state/onboarding-wizard/state';
import { ListTopicsRequestSchema } from '../../../protogen/redpanda/api/dataplane/v1/topic_pb';
import { AddDataStep, type AddDataStepRef } from './steps/add-data-step';
import { AddTopicStep, type AddTopicStepRef } from './steps/add-topic-step';
import { AddUserStep, type AddUserStepRef } from './steps/add-user-step';
import { ConnectStep } from './steps/connect-step';
import { type DataType, getStepDefinitions, WizardStep } from './types';
import { type ConnectionType, generateConnectConfig } from './utils/connect';
import { handleStepResult } from './utils/wizard';

//   import { quickstartModalViewedEvent } from 'utils/analytics.utils'; TODO: add analytics

interface ServerlessOnboardingWizardProps {
  isOpen: boolean;
  dataType: DataType;
  onClose?: () => void;
  additionalConnections?: ConnectionType[];
}

const shouldAllowStepNavigation = (
  targetStepId: WizardStep,
  currentStepId: WizardStep,
  completedSteps: string[],
): boolean => {
  const stepOrder = [WizardStep.ADD_DATA, WizardStep.ADD_TOPIC, WizardStep.ADD_USER, WizardStep.CONNECT];
  const targetIndex = stepOrder.indexOf(targetStepId);
  const currentIndex = stepOrder.indexOf(currentStepId);

  // Allow navigation to current step or previous steps only
  const isPreviousStep = targetIndex <= currentIndex;
  const isStepCompleted = completedSteps.includes(targetStepId);
  const allStepsCompleted = completedSteps.length === 3;

  return isPreviousStep || isStepCompleted || allStepsCompleted;
};

const CREATE_RPCN_PATH = '/rp-connect/create';
const CREATE_RPCN_PARAM = 'quickstart=true';

export const ServerlessOnboardingWizard = memo(
  ({ isOpen, onClose, dataType, additionalConnections }: ServerlessOnboardingWizardProps) => {
    const stepDefinitions = useMemo(() => getStepDefinitions(dataType), [dataType]);
    const { Stepper } = useMemo(() => defineStepper(...stepDefinitions), [stepDefinitions]);
    const { getCompletedSteps, getAllFormData, connectConfig, setConnectConfig } = useOnboardingWizardStore();
    const populatedConfig = generateConnectConfig(getAllFormData(), connectConfig);

    const addDataStepRef = useRef<AddDataStepRef>(null);
    const addTopicStepRef = useRef<AddTopicStepRef>(null);
    const addUserStepRef = useRef<AddUserStepRef>(null);
    // const navigate = useNavigate();
    const { data: topicList } = useLegacyListTopicsQuery(create(ListTopicsRequestSchema, {}), {
      hideInternalTopics: true,
    });
    const { data: usersList } = useLegacyListUsersQuery();
    const { pathname, search } = useLocation();

    const handleNext = async (methods: { current: { id: WizardStep }; next: () => void }) => {
      switch (methods.current.id) {
        case WizardStep.ADD_DATA: {
          const result = await addDataStepRef.current?.triggerSubmit();
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
          setConnectConfig({ yaml: populatedConfig.yaml, type: connectConfig?.type || 'input' });
          handleStepResult(result, methods.next);
          break;
        }
        case WizardStep.CONNECT: {
          break;
        }
        default:
          methods.next();
      }
    };

    const handleOpenChange = useCallback(
      (open: boolean) => {
        if (!open) {
          useOnboardingWizardStore.getState().clearAllFormData();
          onClose?.();
        }
      },
      [onClose],
    );

    const getStepperDefaultValue = useCallback(() => {
      return pathname.includes(CREATE_RPCN_PATH) && search.includes(CREATE_RPCN_PARAM) ? WizardStep.CONNECT : undefined;
    }, [pathname, search]);

    return (
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <Stepper.Provider className="space-y-4" initialStep={getStepperDefaultValue()}>
          {({ methods }) => (
            <SheetContent className="sm:max-w-screen lg:max-w-7xl lg:w-7xl w-full overflow-y-auto">
              <Toaster expand />
              <div className="relative flex flex-col h-full">
                <div className="flex flex-col gap-8 pt-6 h-full">
                  <SheetHeader>
                    <Stepper.Navigation>
                      {stepDefinitions.map((step) => (
                        <Stepper.Step
                          key={step.id}
                          of={step.id}
                          disabled={!shouldAllowStepNavigation(step.id, methods.current.id, getCompletedSteps())}
                          onClick={() => methods.goTo(step.id)}
                        >
                          <Stepper.Title>{step.title}</Stepper.Title>
                        </Stepper.Step>
                      ))}
                    </Stepper.Navigation>
                  </SheetHeader>
                  {methods.switch({
                    [WizardStep.ADD_DATA]: () => (
                      <AddDataStep
                        ref={addDataStepRef}
                        dataType={dataType}
                        additionalConnections={additionalConnections}
                      />
                    ),
                    [WizardStep.ADD_TOPIC]: () => <AddTopicStep ref={addTopicStepRef} topicList={topicList.topics} />,
                    [WizardStep.ADD_USER]: () => <AddUserStep ref={addUserStepRef} usersList={usersList?.users} />,
                    [WizardStep.CONNECT]: () => <ConnectStep additionalConnections={additionalConnections} />,
                  })}
                </div>
                <SheetFooter sticky>
                  <Stepper.Controls>
                    {!methods.isFirst && (
                      <Button type="button" variant="secondary" onClick={methods.prev}>
                        Previous
                      </Button>
                    )}
                    {methods.isLast ? (
                      <Button asChild>
                        <Link
                          as={ReactRouterLink}
                          /**
                           * Since this is rendered in CloudUI, we need to use hard navigation to ensure that the
                           * history/routing is taken over by Console so that it can render its equivalent
                           * /rp-connect/create route component
                           */
                          reloadDocument
                          to={`${CREATE_RPCN_PATH}?${CREATE_RPCN_PARAM}`}
                        >
                          Finish
                        </Link>
                      </Button>
                    ) : (
                      <Button onClick={() => handleNext(methods)}>{methods.isLast ? 'Finish' : 'Next'}</Button>
                    )}
                  </Stepper.Controls>
                </SheetFooter>
              </div>
            </SheetContent>
          )}
        </Stepper.Provider>
      </Sheet>
    );
  },
);
