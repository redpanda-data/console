/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */
/** biome-ignore-all lint/correctness/useUniqueElementIds: legacy, needs refactor */

import { ConnectError } from '@connectrpc/connect';
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Stat } from 'components/redpanda-ui/components/stat';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { motion } from 'motion/react';
import { closeToast, showToast, updateToast } from 'utils/toast.utils';

import { ActiveReassignments } from './components/active-reassignments';
import { WizardSteps } from './components/wizard-steps';
import { type ApiData, computeReassignments, type TopicPartitions } from './logic/reassign-logic';
import { ReassignmentTracker } from './logic/reassignment-tracker';
import {
  computeMovedReplicas,
  partitionSelectionToTopicPartitions,
  topicAssignmentsToReassignmentRequest,
} from './logic/utils';
import { StepSelectPartitions } from './step1-partitions';
import { StepSelectBrokers } from './step2-brokers';
import { StepReview, type TopicWithMoves } from './step3-review';
import { appGlobal } from '../../../state/app-global';
import { api, partialTopicConfigs } from '../../../state/backend-api';
import type {
  AlterPartitionReassignmentsPartitionResponse,
  AlterPartitionReassignmentsResponse,
  Broker,
  PartialTopicConfigsResponse,
  Partition,
  PartitionReassignmentRequest,
  PatchConfigsResponse,
  Topic,
} from '../../../state/rest-interfaces';
import { uiSettings } from '../../../state/ui';
import { animProps } from '../../../utils/animation-props';
import { IsDev } from '../../../utils/env';
import { clone, toJson } from '../../../utils/json-utils';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import { scrollTo, scrollToTop } from '../../../utils/utils';
import { FeatureLicenseNotification } from '../../license/feature-license-notification';
import { showErrorModal } from '../../misc/error-modal';
import { NullFallbackBoundary } from '../../misc/null-fallback-boundary';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';
import { PageComponent, type PageInitHelper } from '../page';
import { CompactSection } from '../shared/compact-section';

export type PartitionSelection = {
  // Which partitions are selected?
  [topicName: string]: number[]; // topicName -> array of partitionIds
};

const reassignmentTracker = new ReassignmentTracker();

export { reassignmentTracker };

type ReassignPartitionsState = {
  removeThrottleFromTopicsContent: string[] | null;
  currentStep: number;
  partitionSelection: PartitionSelection;
  selectedBrokerIds: number[];
  reassignmentRequest: PartitionReassignmentRequest | null;
  topicsWithThrottle: string[];
  requestInProgress: boolean;
};

class ReassignPartitions extends PageComponent {
  refreshTopicConfigsTimer: number | null = null;
  refreshTopicConfigsRequestsInProgress = 0;

  state: ReassignPartitionsState = {
    removeThrottleFromTopicsContent: null,
    currentStep: 0,
    partitionSelection: {},
    selectedBrokerIds: [],
    reassignmentRequest: null,
    topicsWithThrottle: [],
    requestInProgress: false,
  };

  // Getter wrappers so the steps[] isEnabled functions can read rp.partitionSelection etc.
  get partitionSelection() {
    return this.state.partitionSelection;
  }
  get selectedBrokerIds() {
    return this.state.selectedBrokerIds;
  }

  constructor(p: Readonly<{ matchedPath: string }>) {
    super(p);
  }

  initPage(p: PageInitHelper): void {
    p.title = 'Reassign Partitions';
    p.addBreadcrumb('Reassign Partitions', '/reassign-partitions');

    appGlobal.onRefresh = () => this.refreshData(true);
    this.refreshData(true);
  }

  componentDidMount() {
    super.componentDidMount();
    this.removeThrottleFromTopics = this.removeThrottleFromTopics.bind(this);
    this.onNextPage = this.onNextPage.bind(this);
    this.onPreviousPage = this.onPreviousPage.bind(this);
    this.startRefreshingTopicConfigs = this.startRefreshingTopicConfigs.bind(this);
    this.stopRefreshingTopicConfigs = this.stopRefreshingTopicConfigs.bind(this);
    this.refreshTopicConfigs = this.refreshTopicConfigs.bind(this);
    // biome-ignore lint/suspicious/noConsole: existing console error logging
    this.refreshTopicConfigs().catch(console.error);
    this.startRefreshingTopicConfigs();

    reassignmentTracker.start();
  }

  componentDidUpdate(_prevProps: Readonly<{ matchedPath: string }>, prevState: Readonly<ReassignPartitionsState>) {
    // Auto-scroll when navigating to a non-first step
    if (prevState.currentStep !== this.state.currentStep && this.state.currentStep !== 0) {
      setTimeout(() => scrollTo('wizard', 'start', -20), 20);
    }

    // Reset selection if brokers or partitions become unavailable
    if (
      prevState.selectedBrokerIds !== this.state.selectedBrokerIds ||
      prevState.partitionSelection !== this.state.partitionSelection
    ) {
      this.resetSelectionIfUnavailable();
    }
  }

  resetSelectionIfUnavailable() {
    const { selectedBrokerIds, partitionSelection } = this.state;

    if (selectedBrokerIds.length === 0 && isPartitionSelectionEmpty(partitionSelection)) {
      return; // nothing selected so far
    }

    // has user selected a broker that is not available anymore?
    const brokerUnavailable = selectedBrokerIds.any(
      (x) => api.clusterInfo?.brokers.find((b) => b.brokerId === x) === undefined
    );

    // has user selected a topic partition that is not available anymore?
    if (brokerUnavailable || this.selectedTopicPartitions === null) {
      this.resetSelectionAndPage(true, true);
    }
  }

  refreshData(force: boolean) {
    api.refreshCluster(force); // need to know brokers for reassignment calculation, will also refresh config
    api.refreshTopics(force);
    api.refreshPartitions('all', force);
    api.refreshPartitionReassignments(force);
  }

  componentWillUnmount() {
    super.componentWillUnmount();
    reassignmentTracker.stop();
    this.stopRefreshingTopicConfigs();
  }

  render() {
    if (!api.clusterInfo) {
      return DefaultSkeleton;
    }
    if (!api.topics) {
      return DefaultSkeleton;
    }

    if (api.partitionReassignments === undefined) {
      return DefaultSkeleton;
    }

    return (
      <div className="reassignPartitions" style={{ paddingBottom: '12em' }}>
        <PageContent>
          <NullFallbackBoundary>
            <FeatureLicenseNotification featureName="reassignPartitions" />
          </NullFallbackBoundary>

          {/* Statistics */}
          <ClusterStatistics brokerCount={api.clusterInfo.brokers.length} topics={api.topics} />

          {/* Active Reassignments */}
          <Section id="activeReassignments">
            <ActiveReassignments
              onRemoveThrottleFromTopics={this.removeThrottleFromTopics}
              throttledTopics={this.state.topicsWithThrottle}
            />
          </Section>

          {/* Content */}
          <Section id="wizard">
            {/* Steps */}
            <div style={{ margin: '.75em 1em 1em 1em' }}>
              <WizardSteps currentStep={this.state.currentStep} steps={steps} />
            </div>

            {/* Content */}
            <motion.div {...animProps} key={`step${this.state.currentStep}`}>
              {' '}
              {this.renderStepContent()}
            </motion.div>

            {/* Navigation */}
            {this.renderNavigation()}
          </Section>
        </PageContent>
        {this.renderRemoveThrottleDialog()}
      </div>
    );
  }

  renderStepContent() {
    const { currentStep, partitionSelection, selectedBrokerIds, reassignmentRequest } = this.state;

    switch (currentStep) {
      case 0:
        return (
          <StepSelectPartitions
            onPartitionSelectionChange={(newSelection) => this.setState({ partitionSelection: newSelection })}
            partitionSelection={partitionSelection}
            throttledTopics={this.state.topicsWithThrottle}
          />
        );
      case 1:
        return (
          <StepSelectBrokers
            onSelectionChange={(newIds) => this.setState({ selectedBrokerIds: newIds })}
            partitionSelection={partitionSelection}
            selectedBrokerIds={selectedBrokerIds}
          />
        );
      case 2:
        return (
          <StepReview
            // biome-ignore lint/style/noNonNullAssertion: not touching MobX observables
            assignments={reassignmentRequest!}
            partitionSelection={partitionSelection}
            reassignPartitions={this}
            topicsWithMoves={this.topicsWithMoves}
          />
        );
      default:
        return null;
    }
  }

  renderNavigation() {
    const { currentStep, requestInProgress } = this.state;

    const step = steps[currentStep];
    const nextButtonCheck = step.nextButton.isEnabled(this);
    const nextButtonEnabled = nextButtonCheck === true;
    const nextButtonHelp = typeof nextButtonCheck === 'string' ? (nextButtonCheck as string) : null;

    return (
      <div
        style={{
          margin: '2.5em 0 1.5em',
          display: 'flex',
          alignItems: 'flex-end',
          height: '2.5em',
        }}
      >
        {/* Back */}
        {Boolean(step.backButton) && (
          <Button className="min-w-56" disabled={currentStep <= 0 || requestInProgress} onClick={this.onPreviousPage}>
            <span>
              <ChevronLeftIcon />
            </span>
            <span>{step.backButton}</span>
          </Button>
        )}

        {/* Next */}
        <div className="ml-auto flex items-center gap-8">
          <div>{nextButtonHelp}</div>
          <Button
            className="min-w-56"
            disabled={!nextButtonEnabled || requestInProgress}
            onClick={this.onNextPage}
            variant="primary"
          >
            <span>{step.nextButton.text}</span>
            <span>
              <ChevronRightIcon />
            </span>
          </Button>
        </div>
      </div>
    );
  }

  renderRemoveThrottleDialog() {
    return (
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            this.setState({ removeThrottleFromTopicsContent: null });
          }
        }}
        open={this.state.removeThrottleFromTopicsContent !== null}
      >
        {/* Nearest rung to the old 64rem minimum. */}
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>
              <span className="flex items-center gap-2">
                <AlertIcon size={18} />
                Remove throttle config from topics
              </span>
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div>
              <div>
                There are {this.state.topicsWithThrottle.length} topics with throttling applied to their replicas.
                <br />
                Kowl implements throttling of reassignments by setting{' '}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="cursor-help underline decoration-dotted" tabIndex={0}>
                          two configuration values
                        </span>
                      }
                    />
                    <TooltipContent className="max-w-[500px] text-left">
                      Kowl sets those two configuration entries when throttling a topic reassignment:
                      <div className="mt-2">
                        <code>leader.replication.throttled.replicas</code>
                        <br />
                        <code>follower.replication.throttled.replicas</code>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>{' '}
                in a topics configuration.
                <br />
                So if you previously used Kowl to reassign any of the partitions of the following topics, the throttling
                config might still be active.
              </div>
              <div style={{ margin: '1em 0' }}>
                <h4>Throttled Topics</h4>
                <ul style={{ maxHeight: '145px', overflowY: 'auto' }}>
                  {this.state.removeThrottleFromTopicsContent?.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
              <div>Do you want to remove the throttle config from those topics?</div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              onClick={() => {
                this.setState({ removeThrottleFromTopicsContent: null });
              }}
              variant="ghost"
            >
              Cancel
            </Button>
            <Button onClick={() => this.confirmRemoveThrottle()} variant="destructive">
              Remove throttle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  async confirmRemoveThrottle() {
    if (this.state.removeThrottleFromTopicsContent === null) {
      return;
    }
    const baseText = 'Removing throttle config from topics';

    const toastId = showToast({
      status: 'loading',
      description: `${baseText}...`,
    });

    const result = await api.resetThrottledReplicas(this.state.removeThrottleFromTopicsContent);
    const errors = result.patchedConfigs.filter((r) => r.error);
    updateToast(toastId, throttleRemovalOutcome(baseText, errors.length));

    await this.refreshTopicConfigs();
    this.setState({ removeThrottleFromTopicsContent: null });
  }

  resetSelectionAndPage(scrollTop: boolean, showSelectionWarning: boolean) {
    this.refreshData(true);
    this.setState({
      partitionSelection: {},
      selectedBrokerIds: [],
      reassignmentRequest: null,
    });

    if (showSelectionWarning) {
      showToast({
        status: 'warning',
        title: 'Selection has been reset',
        description:
          'Your selection contained brokers or partitions that are not available anymore after the refresh. \n' +
          'Your selection has been reset.',
        duration: 2000,
      });
    }

    if (scrollTop) {
      setTimeout(() => {
        this.setState({ currentStep: 0 });
        setTimeout(() => scrollToTop());
      }, 300);
    }
  }

  onNextPage() {
    if (this.state.currentStep === 0) {
      // Select -> Assign
    }

    // Assign -> Review
    if (this.state.currentStep === 1 && !this.planReassignment()) {
      return;
    }

    if (this.state.currentStep === 2) {
      // Review -> Start
      this.startReviewedReassignment();
      return;
    }

    this.setState({ currentStep: this.state.currentStep + 1 });
  }

  /** Computes the reassignment request for the selection. Returns false when the selection had to be reset instead. */
  planReassignment(): boolean {
    const topicPartitions = this.selectedTopicPartitions;
    if (topicPartitions === null || topicPartitions === undefined) {
      this.resetSelectionAndPage(true, true);
      return false;
    }

    const targetBrokers = this.selectedTargetBrokers();

    // error checking will happen inside computeReassignments
    const apiData: ApiData = {
      brokers: api.clusterInfo?.brokers ?? [],
      topics: api.topics as Topic[],
      topicPartitions: partitionsWithoutErrors(api.topicPartitions),
    };

    const topicAssignments = computeReassignments(apiData, topicPartitions, targetBrokers);

    this.setState({ reassignmentRequest: topicAssignmentsToReassignmentRequest(topicAssignments) });
    return true;
  }

  selectedTargetBrokers(): Broker[] {
    const targetBrokers = this.state.selectedBrokerIds
      .map((id) => api.clusterInfo?.brokers.first((b) => b.brokerId === id))
      .filterFalsy();
    if (targetBrokers.any((b) => b === null)) {
      throw new Error('one or more broker ids could not be mapped to broker entries');
    }
    return targetBrokers;
  }

  startReviewedReassignment() {
    const request = this.state.reassignmentRequest;
    if (request === null) {
      showToast({
        status: 'error',
        description: 'reassignment request was null',
        duration: 3000,
      });
      return;
    }

    setTimeout(() => this.runReassignment(request));
  }

  async runReassignment(request: PartitionReassignmentRequest) {
    try {
      this.setState({ requestInProgress: true });
      // todo: Don't use returns and execeptions for control flow
      const success = await this.startReassignment(request);
      if (success) {
        // Reset settings, go back to first page
        this.resetSelectionAndPage(true, false);
      }
    } catch (err) {
      // biome-ignore lint/suspicious/noConsole: the toast promises console detail
      console.error('start partition reassignment failed', err);
      showToast({
        status: 'error',
        description: 'Error starting partition reassignment.\nSee console for more information.',
        duration: 3000,
      });
    } finally {
      this.setState({ requestInProgress: false });
    }
  }

  onPreviousPage() {
    this.setState({ currentStep: this.state.currentStep - 1 });
  }

  async startReassignment(request: PartitionReassignmentRequest): Promise<boolean> {
    if (uiSettings.reassignment.maxReplicationTraffic !== null && uiSettings.reassignment.maxReplicationTraffic > 0) {
      const success = await this.setTrafficLimit(request);
      if (!success) {
        return false;
      }
    }

    const toastRef = showToast({
      status: 'loading',
      description: 'Starting reassignment',
    });
    try {
      const response = await api.startPartitionReassignment(request);
      return this.reportReassignmentResult(toastRef, response);
    } catch (err) {
      showRequestFailure(toastRef, 'startReassignment failed', 'Could not start the reassignment', err);
      return false;
    }
  }

  /** Settles the toast, and lists the failed partitions when there are any. Fails only when no partition started. */
  reportReassignmentResult(toastRef: string, response: AlterPartitionReassignmentsResponse): boolean {
    const errors = reassignmentErrors(response);
    const startedCount = response.reassignPartitionsResponses.sum((x) => x.partitions.count((p) => !p.errorCode));

    // No errors, or only some errors: still successful
    const success = errors.length === 0 || startedCount > 0;
    updateToast(toastRef, success ? REASSIGNMENT_STARTED_TOAST : REASSIGNMENT_FAILED_TOAST);

    if (errors.length > 0) {
      this.setReassignError(startedCount, errors);
    }
    return success;
  }

  async setTrafficLimit(request: PartitionReassignmentRequest): Promise<boolean> {
    const toastRef = showToast({
      status: 'loading',
      description: 'Setting bandwidth throttle... 1/2',
    });
    try {
      await applyReplicationThrottle(toastRef, request);
      return true;
    } catch (err) {
      // The per-broker patch fails outright on Redpanda ("Setting broker properties on named
      // brokers is unsupported"), so the message itself is what an operator needs.
      showRequestFailure(toastRef, 'setTrafficLimit failed', 'Could not set the bandwidth throttle', err);
      return false;
    }
  }

  setReassignError(
    startedCount: number,
    errors: {
      topicName: string;
      partitions: AlterPartitionReassignmentsPartitionResponse[];
    }[]
  ) {
    showErrorModal(
      'Reassign Partitions',
      `Reassignment request returned errors for ${errors.sum((e) => e.partitions.length)} / ${startedCount} partitions.`,
      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
        {errors.map((r) => (
          <div key={r.topicName}>
            <div>
              <h4>Topic: "{r.topicName}"</h4>
              <ul>
                {r.partitions.map((p) => (
                  <li key={p.partitionId}>
                    PartitionID {p.partitionId}: {p.errorMessage}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    );
  }

  startRefreshingTopicConfigs() {
    if (IsDev && this.refreshTopicConfigsTimer === null) {
      this.refreshTopicConfigsTimer = window.setInterval(this.refreshTopicConfigs, 6000);
    }
  }
  stopRefreshingTopicConfigs() {
    if (IsDev && this.refreshTopicConfigsTimer) {
      window.clearInterval(this.refreshTopicConfigsTimer);
      this.refreshTopicConfigsTimer = null;
    }
  }

  async refreshTopicConfigs() {
    try {
      if (this.refreshTopicConfigsRequestsInProgress > 0) {
        return;
      }
      this.refreshTopicConfigsRequestsInProgress += 1;
      const topicConfigs = await partialTopicConfigs([
        'follower.replication.throttled.replicas',
        'leader.replication.throttled.replicas',
      ]);

      this.setState({
        topicsWithThrottle: throttledTopicNames(topicConfigs.topicDescriptions, this.topicPartitionsInProgress),
      });
    } catch (_err) {
      this.stopRefreshingTopicConfigs();
    } finally {
      this.refreshTopicConfigsRequestsInProgress -= 1;
    }
  }

  removeThrottleFromTopics() {
    this.setState({ removeThrottleFromTopicsContent: clone(this.state.topicsWithThrottle) });
  }

  get selectedTopicPartitions(): TopicPartitions[] | undefined {
    const apiTopics = api.topics;
    const apiPartitions = api.topicPartitions;

    if (!(apiTopics && apiPartitions)) {
      // biome-ignore lint/suspicious/useGetterReturn: early return for undefined case
      return;
    }

    return partitionSelectionToTopicPartitions(this.state.partitionSelection, apiPartitions, apiTopics);
  }

  get maximumSelectedReplicationFactor(): number {
    let maxRf = 0;
    for (const topicName in this.state.partitionSelection) {
      if (Object.hasOwn(this.state.partitionSelection, topicName)) {
        const topic = api.topics?.first((x) => x.topicName === topicName);
        if (topic && topic.replicationFactor > maxRf) {
          maxRf = topic.replicationFactor;
        }
      }
    }
    return maxRf;
  }

  get topicsWithMoves(): TopicWithMoves[] {
    if (this.state.reassignmentRequest === null) {
      return [];
    }
    if (api.topics === null) {
      return [];
    }
    return computeMovedReplicas(
      this.state.partitionSelection,
      this.state.reassignmentRequest,
      api.topics,
      api.topicPartitions
    );
  }

  get topicPartitionsInProgress(): string[] {
    return api.partitionReassignments?.map((r) => r.topicName) ?? [];
  }
}
export default ReassignPartitions;

type WizardStep = {
  step: number;
  title: string;
  backButton?: string;
  nextButton: {
    text: string;
    isEnabled: (rp: ReassignPartitions) => boolean | string;
    computeWarning?: (rp: ReassignPartitions) => string | undefined;
  };
};
const steps: WizardStep[] = [
  {
    step: 0,
    title: 'Select Partitions',
    nextButton: {
      text: 'Select Target Brokers',
      // Can only continue if at least one partition was selected
      isEnabled: (rp) => Object.keys(rp.partitionSelection).length > 0,
    },
  },
  {
    step: 1,
    title: 'Assign to Brokers',
    backButton: 'Select Partitions',
    nextButton: {
      text: 'Review Plan',
      // Can only continue if enough brokers are selected,
      // so all replicas of each partitions can be put on a different broker.
      isEnabled: (rp) => {
        const maxRf = rp.maximumSelectedReplicationFactor;

        if (rp.selectedBrokerIds.length < maxRf) {
          return `Select at least ${maxRf} brokers`;
        }

        return true;
      },
    },
  },
  {
    step: 2,
    title: 'Review and Confirm',
    backButton: 'Select Target Brokers',
    nextButton: {
      text: 'Start Reassignment',
      isEnabled: () => true,
    },
  },
];

function ClusterStatistics({ brokerCount, topics }: { brokerCount: number; topics: Topic[] }) {
  const partitionCountLeaders = topics.sum((t) => t.partitionCount);
  const partitionCountOnlyReplicated = topics.sum((t) => t.partitionCount * (t.replicationFactor - 1));

  return (
    <CompactSection>
      {/* Scoped: step 1's SelectionInfoBar repeats these labels. */}
      <div className="flex gap-8" data-testid="cluster-statistics">
        <Stat label="Broker Count" size="lg" value={brokerCount} />
        <Stat label="Leader Partitions" size="lg" value={partitionCountLeaders ?? '...'} />
        <Stat label="Replica Partitions" size="lg" value={partitionCountOnlyReplicated ?? '...'} />
        <Stat
          label="Total Partitions"
          size="lg"
          value={
            partitionCountLeaders !== null && partitionCountOnlyReplicated !== null
              ? partitionCountLeaders + partitionCountOnlyReplicated
              : '...'
          }
        />
      </div>
    </CompactSection>
  );
}

/** True when no topic has a selected partition. */
function isPartitionSelectionEmpty(partitionSelection: PartitionSelection): boolean {
  const selectedTopicPartitions = Object.values(partitionSelection);
  return selectedTopicPartitions.length === 0 || selectedTopicPartitions.all((x) => x.length === 0);
}

function throttleRemovalOutcome(baseText: string, errorCount: number) {
  if (errorCount === 0) {
    return { status: 'success', description: `${baseText} - Done`, duration: 2500 } as const;
  }
  return { status: 'error', description: `${baseText}: ${errorCount} errors`, duration: 2500 } as const;
}

/** The loaded partitions of every topic, without the partitions that report errors. */
function partitionsWithoutErrors(topicPartitions: Map<string, Partition[] | null>): Map<string, Partition[]> {
  const apiTopicPartitions = new Map<string, Partition[]>();
  for (const [topicName, partitions] of topicPartitions) {
    if (!partitions) {
      continue;
    }
    const validOnly = partitions.filter((x) => !x.hasErrors);
    apiTopicPartitions.set(topicName, validOnly);
  }
  return apiTopicPartitions;
}

const REASSIGNMENT_STARTED_TOAST = {
  status: 'success',
  description: 'Reassignment successful',
  duration: 2500,
} as const;
const REASSIGNMENT_FAILED_TOAST = { status: 'error', description: 'Reassignment failed', duration: 2500 } as const;

/** The partitions that report an error message, by topic; topics without any are left out. */
function reassignmentErrors(response: AlterPartitionReassignmentsResponse) {
  return response.reassignPartitionsResponses
    .map((e) => {
      const partErrors = e.partitions.filter((p) => p.errorMessage !== null);
      if (partErrors.length === 0) {
        return null;
      }
      return { topicName: e.topicName, partitions: partErrors };
    })
    .filterNull();
}

/** Replaces the loading toast with an error toast carrying the failure's message, and logs the details. */
function showRequestFailure(toastRef: string, logMessage: string, title: string, err: unknown) {
  closeToast(toastRef);
  // biome-ignore lint/suspicious/noConsole: the toast promises console detail
  console.error(logMessage, err);
  showToast({
    status: 'error',
    title,
    description: ConnectError.from(err).rawMessage,
    duration: 6000,
  });
}

type ThrottledReplica = { partitionId: number; brokerId: number };

function throttledTopicReplicas(t: PartitionReassignmentRequest['topics'][number]) {
  const leaderReplicas: ThrottledReplica[] = [];
  const followerReplicas: ThrottledReplica[] = [];
  for (const { partitionId, replicas: brokersNew } of t.partitions) {
    const brokersOld = api.topicPartitions
      ?.get(t.topicName)
      ?.first((partition) => partition.id === partitionId)?.replicas;

    if (brokersOld === null || brokersOld === undefined || brokersNew === null) {
      continue;
    }

    // leader throttling is applied to all sources (all brokers that have a replica of this partition)
    leaderReplicas.push(...brokersOld.map((sourceBroker) => ({ partitionId, brokerId: sourceBroker })));

    // follower throttling is applied only to target brokers that do not yet have a copy
    followerReplicas.push(
      ...brokersNew.except(brokersOld).map((targetBroker) => ({ partitionId, brokerId: targetBroker }))
    );
  }

  return {
    topicName: t.topicName,
    leaderReplicas,
    followerReplicas,
  };
}

function throwOnPatchErrors(response: PatchConfigsResponse) {
  const errors = response.patchedConfigs.filter((c) => c.error);
  if (errors.length > 0) {
    throw new Error(toJson(errors));
  }
}

/** Sets the broker-wide throttle rate, then marks the moving replicas as throttled, reporting progress in the toast. */
async function applyReplicationThrottle(toastRef: string, request: PartitionReassignmentRequest) {
  const maxBytesPerSecond = Math.round(uiSettings.reassignment.maxReplicationTraffic ?? 0);
  const topicReplicas = request.topics.map((t) => throttledTopicReplicas(t));

  const brokerIds = api.clusterInfo?.brokers.map((b) => b.brokerId) ?? [];
  throwOnPatchErrors(await api.setReplicationThrottleRate(brokerIds, maxBytesPerSecond));

  updateToast(toastRef, {
    description: 'Setting bandwidth throttle... 2/2',
    duration: 2500,
  });

  throwOnPatchErrors(await api.setThrottledReplicas(topicReplicas));

  updateToast(toastRef, {
    status: 'success',
    description: 'Setting bandwidth throttle... done',
    duration: 2500,
  });
}

/** The topics with a throttle applied, by name, leaving out those still being reassigned. */
function throttledTopicNames(
  topicDescriptions: PartialTopicConfigsResponse['topicDescriptions'],
  topicsInProgress: string[]
): string[] {
  // Only get the names of the topics that have throttles applied
  const newThrottledTopics = topicDescriptions
    .filter((t) => t.configEntries.any((x) => Boolean(x.value)))
    .map((t) => t.topicName)
    .sort();

  // Filter topics that are still being reassigned
  return newThrottledTopics.filter((t) => !topicsInProgress.includes(t));
}
