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

import { relativeAgeLabel } from './draft-copy';

/**
 * Offered when the editor finds an autosaved buffer that doesn't match what was loaded — the tab was
 * closed, the browser crashed, or the session timed out mid-edit.
 *
 * The loaded configuration stays on screen until the user chooses, so recovered work can never
 * silently overwrite what is actually saved. Discarding is explicit for the same reason.
 */
export function AutosaveRestoreNotice({
  updatedAt,
  /** True when the saved pipeline has been written since this buffer was captured. */
  isStale,
  onRestore,
  onDiscard,
}: {
  updatedAt: number;
  isStale?: boolean;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <Alert icon={<FileClock />} testId="autosave-restore-notice" variant={isStale ? 'warning' : 'info'}>
      <AlertTitle>Unsaved changes from {relativeAgeLabel(updatedAt)}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>
          {isStale
            ? 'This pipeline has been saved by someone since you were editing. Restoring replaces what is shown with your unsaved version.'
            : 'These changes were never saved. The configuration shown is the saved one.'}
        </span>
        <span className="flex items-center gap-2">
          <Button onClick={onRestore} size="sm" testId="restore-autosave" variant="outline">
            Restore my changes
          </Button>
          <Button onClick={onDiscard} size="sm" testId="discard-autosave" variant="ghost">
            Discard
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}
