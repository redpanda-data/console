/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Button } from 'components/redpanda-ui/components/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { DisabledReasonTooltip } from 'components/ui/disabled-reason-tooltip';

import type { TopicAction } from '../../../../../state/rest-interfaces';
import { getDeleteErrorText, isDeleteEnabled } from '../helpers';

export function DeleteRecordsMenuItem(
  isCompacted: boolean,
  allowedActions: TopicAction[] | undefined,
  onClick: () => void,
  boxedReason?: string
) {
  const isEnabled = isDeleteEnabled(isCompacted, allowedActions, boxedReason);
  const errorText = getDeleteErrorText(isCompacted, allowedActions, boxedReason);

  const button = (
    <Button disabled={!isEnabled} onClick={onClick} variant="destructive-outline">
      Delete Records
    </Button>
  );

  /** A box's reason is reachable by keyboard and announced; the older reasons keep their tooltip. */
  if (boxedReason && errorText === boxedReason) {
    return <DisabledReasonTooltip reason={boxedReason}>{button}</DisabledReasonTooltip>;
  }

  if (errorText) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={<span>{button}</span>} />
          <TooltipContent side="top">{errorText}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}
