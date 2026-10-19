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
import { useState } from 'react';
import { type BrokerOwnCopy, useShadowBoxStatusQuery } from 'react-query/api/shadow-box';
import { useShadowBoxStore } from 'stores/shadow-box-store';

import {
  type BoxPhase,
  type BoxSummary,
  type BrokerProgress,
  describeBoxPhase,
  describeHeldMove,
  hasBoxActivity,
  isApplyingNewSettings,
  isLongBox,
} from './shadow-box-model';
import { UnboxClusterDialog } from './unbox-cluster-dialog';
import { useNow } from './use-now';

type ActivePhase = Exclude<BoxPhase, 'unboxed'>;

const TITLE: Record<ActivePhase, string> = {
  boxing: 'This cluster is being shadow boxed',
  boxed: 'This cluster is shadow boxed',
  unboxing: 'This cluster is being unboxed',
};

/** What clients run into while the cluster blocks, past the headline. */
const blockedDetail = (summary: BoxSummary) =>
  `Producers get REQUEST_TIMED_OUT and keep retrying${summary.allowAllReads ? '' : ', and only exempt users can fetch from user topics'}. Topic config changes still go through.`;

/** The banner's sentences: where the box stands, what holds it, and what clients see. */
export const describeBanner = (summary: BoxSummary, brokers: BrokerProgress[], now: number): string => {
  const parts = [describeBoxPhase(summary, brokers), describeHeldMove(summary, brokers, now)];
  if (summary.phase !== 'unboxing') {
    parts.push(blockedDetail(summary));
  }
  if (isLongBox(summary, now)) {
    parts.push('Retention and compaction keep deleting old data while it stays boxed.');
  }
  return parts.filter(Boolean).join(' ');
};

/**
 * Shown on every page while a box is anywhere but released, because writes start failing as soon
 * as boxing begins and keep failing on some brokers until unboxing finishes.
 */
/** With no controller leader there's no cluster box to read, but a broker's own blocking copy still rejects writes. */
const NoLeaderBanner = ({ copies }: { copies: BrokerOwnCopy[] }) => {
  const reporting = copies
    .filter((copy) => copy.phase)
    .map((copy) => `${copy.nodeId === undefined ? 'a broker' : `broker ${copy.nodeId}`} reports ${copy.phase}`)
    .join(', ');
  return (
    <div data-testid="shadow-box-banner">
      <Alert className="my-4" data-phase="no-leader" icon={<TriangleAlertIcon />} role="region" variant="warning">
        <AlertTitle>This cluster may be shadow boxed</AlertTitle>
        <AlertDescription>
          <p>
            It has no controller leader right now, so Console read each broker’s own copy of the box: {reporting}.
            Writes to those brokers are rejected.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
};

export const ShadowBoxBanner = () => {
  const { known, summary, brokers, blocking, ownCopies } = useShadowBoxStatusQuery();
  const clusterName = useShadowBoxStore((state) => state.topology?.clusterName);
  /** Held here, not in the alert: an Unbox that lands mid-dialog removes the alert but not the dialog. */
  const [unboxOpen, setUnboxOpen] = useState(false);
  const active = known && hasBoxActivity(summary.phase);
  if (!known && blocking) {
    return <NoLeaderBanner copies={ownCopies} />;
  }
  return (
    <>
      {active ? (
        <ShadowBoxBannerAlert
          brokers={brokers}
          onUnbox={() => setUnboxOpen(true)}
          phase={summary.phase as ActivePhase}
          summary={summary}
        />
      ) : null}
      <UnboxClusterDialog clusterName={clusterName} onOpenChange={setUnboxOpen} open={unboxOpen} />
    </>
  );
};

const ShadowBoxBannerAlert = ({
  phase,
  summary,
  brokers,
  onUnbox,
}: {
  phase: ActivePhase;
  summary: BoxSummary;
  brokers: BrokerProgress[];
  onUnbox: () => void;
}) => {
  const location = useLocation();
  const now = useNow();
  const title = isApplyingNewSettings(summary, brokers)
    ? 'This cluster is applying new shadow box settings'
    : TITLE[phase];
  const onBoxStatusPage =
    location.pathname === '/shadowlinks' && (location.search as { tab?: string }).tab === 'source';

  return (
    <div data-testid="shadow-box-banner">
      <Alert
        aria-label={title}
        // my-4 on the Alert, not the wrapper: the wrapper is a direct child of #mainLayout, whose
        // `margin: 0 !important` (index-cloud-integration.scss) would drop it.
        className="my-4"
        data-phase={phase}
        icon={phase === 'unboxing' ? <InfoIcon /> : <TriangleAlertIcon />}
        // A region, not an alert: its counts and elapsed time change while it stays on screen, and an
        // alert would be announced again on every change.
        role="region"
        variant={phase === 'unboxing' ? 'informative' : 'warning'}
      >
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <p>{describeBanner(summary, brokers, now)}</p>
        </AlertDescription>
        {/* Outside AlertDescription, which restyles every descendant anchor as an inline link. The box
            status page has these actions on its own card. */}
        {onBoxStatusPage ? null : (
          <div className="col-start-2 mt-2 flex flex-wrap gap-2">
            <Button
              render={<Link search={{ tab: 'source' }} to="/shadowlinks" />}
              size="sm"
              testId="shadow-box-banner-view-status"
              variant="outline"
            >
              View box status
            </Button>
            {phase === 'unboxing' ? null : (
              <Button onClick={onUnbox} size="sm" testId="shadow-box-banner-unbox" variant="outline">
                Unbox
              </Button>
            )}
          </div>
        )}
      </Alert>
    </div>
  );
};
