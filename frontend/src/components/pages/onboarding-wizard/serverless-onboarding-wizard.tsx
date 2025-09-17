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
import { Link as ReactRouterLink } from 'react-router-dom';
import { useClearWizardStateCache, useCompletedSteps } from 'state/onboarding-wizard/state';
import { ListTopicsRequestSchema } from '../../../protogen/redpanda/api/dataplane/v1/topic_pb';
import { AddDataStep, type AddDataStepRef } from './steps/add-data-step';
import { AddTopicStep, type AddTopicStepRef } from './steps/add-topic-step';
import { AddUserStep, type AddUserStepRef } from './steps/add-user-step';
import { ConnectStep } from './steps/connect-step';
import { getStepDefinitions, WizardStep } from './types';
import type { ComponentType, ExtendedComponentSpec } from './types/connect';
import { CREATE_RPCN_PARAM, CREATE_RPCN_PATH, handleStepResult, shouldAllowStepNavigation } from './utils/wizard';

//   import { quickstartModalViewedEvent } from 'utils/analytics.utils'; TODO: add analytics

interface ServerlessOnboardingWizardProps {
  isOpen: boolean;
  componentTypeFilter?: ComponentType;
  onClose?: () => void;
  additionalComponents?: ExtendedComponentSpec[];
  initialStep?: WizardStep;
  shouldRedirectToConnect?: boolean;
}

export const ServerlessOnboardingWizard = memo(
  ({
    isOpen,
    onClose,
    componentTypeFilter,
    additionalComponents,
    initialStep,
    shouldRedirectToConnect,
  }: ServerlessOnboardingWizardProps) => {
    const stepDefinitions = useMemo(() => getStepDefinitions(componentTypeFilter), [componentTypeFilter]);
    const { Stepper } = useMemo(() => defineStepper(...stepDefinitions), [stepDefinitions]);
    const completedSteps = useCompletedSteps();
    // const clearWizardStateCache = useClearWizardStateCache();

    const addDataStepRef = useRef<AddDataStepRef>(null);
    const addTopicStepRef = useRef<AddTopicStepRef>(null);
    const addUserStepRef = useRef<AddUserStepRef>(null);

    const { data: topicList } = useLegacyListTopicsQuery(create(ListTopicsRequestSchema, {}), {
      hideInternalTopics: true,
    });
    const { data: usersList } = useLegacyListUsersQuery();

    const handleOpenChange = useCallback(
      (open: boolean) => {
        if (!open) {
          onClose?.();
        } else {
          // reset form whenever the wizard is opened
          // clearWizardStateCache();
        }
      },
      [onClose],
    );

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
          handleStepResult(result, methods.next);
          break;
        }
        case WizardStep.CONNECT: {
          handleOpenChange(false);
          break;
        }
        default:
          methods.next();
      }
    };

    return (
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <Stepper.Provider className="space-y-4" initialStep={initialStep}>
          {({ methods }) => (
            <SheetContent className="sm:max-w-screen lg:max-w-5xl lg:w-5xl w-full overflow-y-auto">
              <Toaster expand />
              <div className="relative flex flex-col h-full">
                <div className="flex flex-col gap-8 pt-6 h-full">
                  <SheetHeader>
                    <Stepper.Navigation>
                      {stepDefinitions.map((step) => (
                        <Stepper.Step
                          key={step.id}
                          of={step.id}
                          disabled={!shouldAllowStepNavigation(step.id, methods.current.id, completedSteps)}
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
                        componentTypeFilter={componentTypeFilter}
                        additionalComponents={additionalComponents}
                      />
                    ),
                    [WizardStep.ADD_TOPIC]: () => <AddTopicStep ref={addTopicStepRef} topicList={topicList.topics} />,
                    [WizardStep.ADD_USER]: () => <AddUserStep ref={addUserStepRef} usersList={usersList?.users} />,
                    [WizardStep.CONNECT]: () => <ConnectStep additionalComponents={additionalComponents} />,
                  })}
                </div>
                <SheetFooter sticky>
                  <Stepper.Controls>
                    {!methods.isFirst && (
                      <Button type="button" variant="secondary" onClick={methods.prev}>
                        Previous
                      </Button>
                    )}
                    {shouldRedirectToConnect && methods.isFirst ? (
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
                          className="no-underline"
                        >
                          Next
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
