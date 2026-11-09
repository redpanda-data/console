/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Link, useLocation } from '@tanstack/react-router';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { InfoIcon, TriangleAlertIcon } from 'lucide-react';
import { type BrokerOwnCopy, useClusterFenceStatusQuery } from 'react-query/api/cluster-fence';

import {
  type BrokerProgress,
  describeFencePhase,
  FENCE_PHASE_LABEL,
  type FencePhase,
  type FenceSummary,
  hasFenceActivity,
  isApplyingNewSettings,
  isBlockingPhase,
} from './cluster-fence-model';

const TITLE: Record<Exclude<FencePhase, 'unfenced'>, string> = {
  fencing: 'This cluster is being fenced',
  fenced: 'This cluster is fenced',
  unfencing: 'This cluster is being unfenced',
};

/** What the phase means for writes, and a warning when the fence lets no one read. */
const describeBanner = (summary: FenceSummary, brokers: BrokerProgress[]): string => {
  const exemptsNobody =
    isBlockingPhase(summary.phase) && !summary.allowAllReads && summary.exemptPrincipals.length === 0;
  return exemptsNobody
    ? `${describeFencePhase(summary, brokers)} It exempts nobody, so no consumer or shadow link can read from it.`
    : describeFencePhase(summary, brokers);
};

/** With no controller leader there's no cluster fence to read, but a broker's own blocking copy still rejects writes. */
const describeOwnCopies = (copies: BrokerOwnCopy[]): string => {
  const reporting = copies.flatMap(({ nodeId, phase }) => {
    if (!phase) {
      return [];
    }
    const broker = nodeId === undefined ? 'a broker' : `broker ${nodeId}`;
    return [`${broker} reports ${FENCE_PHASE_LABEL[phase].toLowerCase()}`];
  });
  const blockingCount = copies.filter((copy) => copy.phase && isBlockingPhase(copy.phase)).length;
  let consequence = '';
  if (blockingCount > 0) {
    consequence =
      blockingCount === reporting.length
        ? ' Writes to those brokers are rejected.'
        : ' Writes are rejected on the brokers that report fencing or fenced.';
  }
  return `It has no controller leader right now, so Console read each broker’s own copy of the fence: ${reporting.join(', ')}.${consequence}`;
};

const bannerTitle = (known: boolean, summary: FenceSummary, brokers: BrokerProgress[]) => {
  if (!known || summary.phase === 'unfenced') {
    return 'This cluster may be fenced';
  }
  return isApplyingNewSettings(summary, brokers) ? 'This cluster is applying new fence settings' : TITLE[summary.phase];
};

/**
 * Shown on every page while a fence is anywhere but released, because writes start failing as soon
 * as fencing begins and keep failing on some brokers until unfencing finishes. Not on the Cluster fence
 * tab, which shows the same and more.
 */
export const ClusterFenceBanner = () => {
  const { known, summary, brokers, blocking, ownCopies } = useClusterFenceStatusQuery();
  const location = useLocation();
  const onFenceTab = location.pathname === '/shadowlinks' && (location.search as { tab?: string }).tab === 'source';
  const { phase } = summary;
  if (onFenceTab || !(known ? hasFenceActivity(phase) : blocking)) {
    return null;
  }
  const title = bannerTitle(known, summary, brokers);
  const unfencing = known && phase === 'unfencing';

  return (
    <div data-testid="cluster-fence-banner">
      <Alert
        aria-label={title}
        // my-4 on the Alert, not the wrapper: the wrapper is a direct child of #mainLayout, whose
        // `margin: 0 !important` (index-cloud-integration.scss) would drop it.
        className="my-4"
        data-phase={known ? phase : 'no-leader'}
        icon={unfencing ? <InfoIcon /> : <TriangleAlertIcon />}
        // A region, not an alert: it stays on screen while the fence moves, and an alert would be
        // announced again on every change.
        role="region"
        variant={unfencing ? 'informative' : 'warning'}
      >
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <p>{known ? describeBanner(summary, brokers) : describeOwnCopies(ownCopies)}</p>
        </AlertDescription>
        {known ? (
          // Outside AlertDescription, which restyles every descendant anchor as an inline link.
          <div className="col-start-2 mt-2">
            <Button
              render={<Link search={{ tab: 'source' }} to="/shadowlinks" />}
              size="sm"
              testId="cluster-fence-banner-view-status"
              variant="outline"
            >
              View fence status
            </Button>
          </div>
        ) : null}
      </Alert>
    </div>
  );
};
