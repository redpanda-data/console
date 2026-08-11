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
import { FileClock } from 'lucide-react';
import { prettyMilliseconds } from 'utils/utils';

/** "5m ago" — same phrasing the rest of Console uses for recent timestamps. */
export const draftAgeLabel = (updatedAt: number, now: number = Date.now()): string => {
  const elapsed = now - updatedAt;
  if (elapsed < 60_000) {
    return 'just now';
  }
  return `${prettyMilliseconds(elapsed, { compact: true })} ago`;
};

/**
 * Offered when a pipeline has locally-drafted edits that were never deployed — usually because the
 * config didn't lint clean at the time. The deployed config stays on screen until the user chooses,
 * so a stale draft can never silently overwrite what's actually running.
 */
export function DraftRestoreNotice({
  updatedAt,
  onRestore,
  onDiscard,
}: {
  updatedAt: number;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <Alert icon={<FileClock />} testId="draft-restore-notice" variant="info">
      <AlertTitle>Unsaved draft from {draftAgeLabel(updatedAt)}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>
          You have local changes to this pipeline that were never deployed. The configuration shown is the deployed one.
        </span>
        <span className="flex items-center gap-2">
          <Button onClick={onRestore} size="sm" testId="restore-draft" variant="outline">
            Restore draft
          </Button>
          <Button onClick={onDiscard} size="sm" testId="discard-draft" variant="ghost">
            Discard
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}
