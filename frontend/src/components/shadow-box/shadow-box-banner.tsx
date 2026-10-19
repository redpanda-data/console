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
import { useShadowBoxStatusQuery } from 'react-query/api/shadow-box';
import { useShadowBoxStore } from 'stores/shadow-box-store';

import {
  type BoxPhase,
  type BoxSummary,
  type BrokerProgress,
  formatBoxDuration,
  isFencedPhase,
  isLongBox,
} from './shadow-box-model';
import { UnboxClusterDialog } from './unbox-cluster-dialog';
import { useNow } from './use-now';

const TITLE: Record<Exclude<BoxPhase, 'unboxed'>, string> = {
  boxing: 'This cluster is being shadow boxed',
  boxed: 'This cluster is shadow boxed',
  unboxing: 'This cluster is being unboxed',
};

/** The banner's sentence for each phase, with broker progress while one is applying a change. */
const describeBanner = (
  phase: Exclude<BoxPhase, 'unboxed'>,
  {
    applied,
    total,
    allowAllReads,
    elapsedMs,
    long,
  }: { applied: number; total: number; allowAllReads: boolean; elapsedMs?: number; long: boolean }
): string => {
  const progress = total > 0 ? ` (${applied} of ${total} so far)` : '';
  const stops = `Clients can’t produce${allowAllReads ? '' : ' or consume'}, or change topics, ACLs, roles or schemas`;
  if (phase === 'boxing') {
    return `${stops} on the brokers that have applied it. It’s in force once every broker confirms${progress}.`;
  }
  if (phase === 'unboxing') {
    return `Some brokers may still reject writes until every broker confirms${progress}.`;
  }
  const elapsed = elapsedMs === undefined ? '' : ` Boxed for ${formatBoxDuration(elapsedMs)}.`;
  const retention = long ? ' Retention and compaction keep running, so old data is still deleted while it waits.' : '';
  return `${stops} until an operator unboxes it.${elapsed}${retention}`;
};

/**
 * Shown on every page while a box is anywhere but released, because writes start failing as soon
 * as boxing begins and keep failing on some brokers until unboxing finishes.
 */
export const ShadowBoxBanner = () => {
  const { known, summary, brokers } = useShadowBoxStatusQuery();
  const clusterName = useShadowBoxStore((state) => state.topology?.clusterName);
  /** Held here, not in the alert: an Unbox that lands mid-dialog removes the alert but not the dialog. */
  const [unboxOpen, setUnboxOpen] = useState(false);
  const fenced = known && isFencedPhase(summary.phase);
  return (
    <>
      {fenced ? (
        <ShadowBoxBannerAlert
          brokers={brokers}
          onUnbox={() => setUnboxOpen(true)}
          phase={summary.phase as Exclude<BoxPhase, 'unboxed'>}
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
  phase: Exclude<BoxPhase, 'unboxed'>;
  summary: BoxSummary;
  brokers: BrokerProgress[];
  onUnbox: () => void;
}) => {
  const location = useLocation();
  const now = useNow();

  const elapsedMs = summary.stateChangedAt ? now - summary.stateChangedAt.getTime() : undefined;
  const body = describeBanner(phase, {
    applied: brokers.filter((broker) => broker.status === 'applied').length,
    total: brokers.length,
    allowAllReads: summary.allowAllReads,
    elapsedMs,
    long: isLongBox(summary, now),
  });
  const onBoxStatusPage =
    location.pathname === '/shadowlinks' && (location.search as { tab?: string }).tab === 'source';

  return (
    <div data-testid="shadow-box-banner">
      <Alert
        aria-label={TITLE[phase]}
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
        <AlertTitle>{TITLE[phase]}</AlertTitle>
        <AlertDescription>
          <p>{body}</p>
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
