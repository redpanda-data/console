import { create } from '@bufbuild/protobuf';
import { Sheet, SheetContent, SheetFooter, SheetHeader } from 'components/redpanda-ui/components/sheet';
import { memo, useCallback, useMemo, useRef } from 'react';
// TODO: add internationalization
// import { FormattedMessage } from 'react-intl';

import { Button } from 'components/redpanda-ui/components/button';
import { Toaster } from 'components/redpanda-ui/components/sonner';
import { defineStepper } from 'components/redpanda-ui/components/stepper';
import { useLegacyListTopicsQuery } from 'react-query/api/topic';
import { useLegacyListUsersQuery } from 'react-query/api/user';
// import { useNavigate } from "react-router-dom";
import { clearAllPersistedData } from 'state/onboarding-wizard/state';
import { ListTopicsRequestSchema } from '../../../protogen/redpanda/api/dataplane/v1/topic_pb';
import { AddDataStep, type AddDataStepRef } from './steps/add-data-step';
import { AddTopicStep, type AddTopicStepRef } from './steps/add-topic-step';
import { AddUserStep, type AddUserStepRef } from './steps/add-user-step';
import { ConnectStep } from './steps/connect-step';
import { type DataType, getStepDefinitions, WizardStep } from './types';
import type { ConnectionType } from './utils/connect';
import { handleStepResult } from './utils/wizard';

//   import { quickstartModalViewedEvent } from 'utils/analytics.utils'; TODO: add analytics

interface ServerlessOnboardingWizardProps {
  isOpen: boolean;
  dataType: DataType;
  onClose?: () => void;
  additionalConnections?: ConnectionType[];
}

const shouldAllowStepNavigation = (targetStepId: WizardStep, currentStepId: WizardStep): boolean => {
  const stepOrder = [WizardStep.ADD_DATA, WizardStep.ADD_TOPIC, WizardStep.ADD_USER, WizardStep.CONNECT];
  const targetIndex = stepOrder.indexOf(targetStepId);
  const currentIndex = stepOrder.indexOf(currentStepId);

  // Allow navigation to current step or previous steps only
  return targetIndex <= currentIndex;
};

export const ServerlessOnboardingWizard = memo(
  ({ isOpen, onClose, dataType, additionalConnections }: ServerlessOnboardingWizardProps) => {
    const stepDefinitions = useMemo(() => getStepDefinitions(dataType), [dataType]);
    const { Stepper } = useMemo(() => defineStepper(...stepDefinitions), [stepDefinitions]);

    const addDataStepRef = useRef<AddDataStepRef>(null);
    const addTopicStepRef = useRef<AddTopicStepRef>(null);
    const addUserStepRef = useRef<AddUserStepRef>(null);
    // const navigate = useNavigate();
    const { data: topicList } = useLegacyListTopicsQuery(create(ListTopicsRequestSchema, {}), {
      hideInternalTopics: true,
    });
    const { data: usersList } = useLegacyListUsersQuery();

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
          // handleStepResult(result, () => {
          // 	if (
          // 		additionalConnections?.some(
          // 			(connection) => connection.name === addDataFormData?.connection,
          // 		)
          // 	) {
          // 		methods.next();
          // 	} else {
          // 		// Navigate to create connector with onboarding state
          // 		// Use the first available cluster or a default
          // 		const clusters = api.connectConnectors?.clusters;
          // 		const clusterName = clusters?.[0]?.clusterName || "default";
          // 		navigate(
          // 			`/connect-clusters/${encodeURIComponent(clusterName)}/create-connector?fromOnboarding=true`,
          // 		);
          // 	}
          // });
          break;
        }
        default:
          methods.next();
      }
    };

    const handleOpenChange = useCallback(
      (open: boolean) => {
        if (!open) {
          clearAllPersistedData();
          onClose?.();
        }
      },
      [onClose],
    );

    return (
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <Stepper.Provider className="space-y-4">
          {({ methods }) => (
            <SheetContent className="sm:max-w-screen lg:max-w-3xl overflow-y-auto">
              <Toaster expand />
              <div className="flex flex-col gap-6 justify-between h-full pt-6">
                <div className="flex flex-col gap-8">
                  <SheetHeader>
                    <Stepper.Navigation>
                      {stepDefinitions.map((step) => (
                        <Stepper.Step
                          key={step.id}
                          of={step.id}
                          disabled={!shouldAllowStepNavigation(step.id, methods.current.id)}
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
                    [WizardStep.CONNECT]: () => (
                      <ConnectStep dataType={dataType} additionalConnections={additionalConnections} />
                    ),
                  })}
                </div>

                <SheetFooter>
                  <Stepper.Controls>
                    {!methods.isFirst && (
                      <Button type="button" variant="secondary" onClick={methods.prev}>
                        Previous
                      </Button>
                    )}
                    <Button onClick={() => handleNext(methods)}>{methods.isLast ? 'Finish' : 'Next'}</Button>
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
