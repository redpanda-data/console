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

import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { RefreshCwIcon } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { describeClusterFenceError } from 'react-query/api/cluster-fence';

import type { FenceSummary } from './cluster-fence-model';

/**
 * Pins the fence a dialog opened against. Writes send its revision, so a change someone else makes
 * while the dialog is open fails instead of being overwritten, and `changed` says so up front.
 * `settling` covers this dialog's own write, whose new revision isn't someone else's change, and
 * `own` is a fence an earlier write of this dialog left behind, which replaces the pinned one.
 */
export const useOpenedFence = (live: FenceSummary, settling: boolean, own?: FenceSummary) => {
  const [pinned, setPinned] = useState(live);
  const opened = own ?? pinned;
  return {
    opened,
    changed: !settling && live.revision !== opened.revision,
    /** Adopts the fence as it is now; callers reseed their form from the same value. */
    refresh: () => setPinned(live),
  };
};

/** Shown in a dialog whose fence changed since it opened; its write would fail. */
export const FenceChangedNotice = ({ onRefresh, refreshLabel }: { onRefresh: () => void; refreshLabel: string }) => (
  <Alert icon={<RefreshCwIcon />} testId="cluster-fence-changed" variant="warning">
    <AlertTitle>The fence changed while this was open</AlertTitle>
    <AlertDescription>
      <p>
        Someone else changed it, or an earlier request that timed out went through after all. Review it as it is now
        before you continue.
      </p>
    </AlertDescription>
    <div className="col-start-2 mt-2">
      <Button onClick={onRefresh} size="sm" testId="cluster-fence-changed-refresh" variant="outline">
        {refreshLabel}
      </Button>
    </div>
  </Alert>
);

/** A failed write, scrolled into view: it renders below the fold of a long dialog body. */
export const FenceWriteErrorAlert = ({
  error,
  title,
  testId,
  children,
}: {
  error: unknown;
  title: string;
  testId: string;
  children?: ReactNode;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) {
      ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [error]);

  return (
    <Alert ref={ref} testId={testId} variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{describeClusterFenceError(error)}</p>
        {children}
      </AlertDescription>
    </Alert>
  );
};
