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

import { CloseIcon, LinkIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import { Text } from 'components/redpanda-ui/components/typography';
import type { FC } from 'react';

type LinkedTraceBannerProps = {
  traceId: string;
  onViewSurrounding: () => void;
  onDismiss: () => void;
};

/**
 * Banner displayed when viewing a linked trace that's outside the current time range.
 * Provides options to view surrounding traces or dismiss and return to normal search.
 */
export const LinkedTraceBanner: FC<LinkedTraceBannerProps> = ({ traceId, onViewSurrounding, onDismiss }) => (
  <div
    className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2"
    data-testid="linked-trace-banner"
  >
    <div className="flex min-w-0 items-center gap-2">
      <LinkIcon className="h-4 w-4 shrink-0 text-primary" />
      <Text as="span" className="truncate" variant="small">
        Viewing linked trace{' '}
        <code
          className="max-w-[200px] truncate rounded bg-muted px-1 py-0.5 font-mono text-xs"
          title={traceId}
        >
          {traceId}
        </code>
      </Text>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      <Button className="h-7 text-xs" onClick={onViewSurrounding} size="sm" variant="outline">
        View Surrounding Traces
      </Button>
      <Button aria-label="Dismiss linked trace" className="h-7 w-7" onClick={onDismiss} size="icon" variant="ghost">
        <CloseIcon className="h-3.5 w-3.5" />
      </Button>
    </div>
  </div>
);
