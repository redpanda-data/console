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

/** Shown in a dialog whose box changed since it opened; its write would fail. */
export const BoxChangedNotice = ({ onRefresh, refreshLabel }: { onRefresh: () => void; refreshLabel: string }) => (
  <Alert icon={<RefreshCwIcon />} testId="shadow-box-changed" variant="warning">
    <AlertTitle>The shadow box changed while this was open</AlertTitle>
    <AlertDescription>
      <p>
        Someone else changed it, or an earlier request that timed out went through after all. Review it as it is now
        before you continue.
      </p>
    </AlertDescription>
    <div className="col-start-2 mt-2">
      <Button onClick={onRefresh} size="sm" testId="shadow-box-changed-refresh" variant="outline">
        {refreshLabel}
      </Button>
    </div>
  </Alert>
);
