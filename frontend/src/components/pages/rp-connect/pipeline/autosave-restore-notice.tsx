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

export function AutosaveRestoreNotice({
  updatedAt,
  /** The pipeline was saved since this buffer was captured. */
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
    <Alert icon={<FileClock />} testId="autosave-restore-notice" variant={isStale ? 'warning' : 'informative'}>
      <AlertTitle>Restore your edits from {relativeAgeLabel(updatedAt)}?</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>
          {isStale
            ? 'This pipeline has been saved by someone since you were editing. Restoring replaces what is on screen with your unsaved version.'
            : 'You left this editor without saving these edits. Restoring puts them back, replacing what is on screen.'}
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
