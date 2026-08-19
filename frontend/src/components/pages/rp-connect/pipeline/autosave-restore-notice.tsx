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
 * Offered when an autosaved buffer doesn't match what loaded. The loaded configuration stays on screen
 * until the user chooses, so recovered work can never silently overwrite what is saved.
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
      {/* Not "unsaved changes": that names the edits in this editor right now, which the header pill and
          the lane both track. This is work from an earlier visit that this browser kept. */}
      <AlertTitle>Restore your edits from {relativeAgeLabel(updatedAt)}?</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>
          {isStale
            ? 'This pipeline has been saved by someone since you were editing. Restoring replaces what is shown with your unsaved version.'
            : 'You left the editor without saving these edits. The configuration shown is the saved one.'}
        </span>
        <span className="flex items-center gap-2">
          <Button onClick={onRestore} size="sm" testId="restore-autosave" variant="outline">
            Restore my edits
          </Button>
          <Button onClick={onDiscard} size="sm" testId="discard-autosave" variant="ghost">
            Discard
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}
