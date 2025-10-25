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

import { Button, Tooltip } from '@redpanda-data/ui';

import type { TopicAction } from '../../../../../state/rest-interfaces';
import { getDeleteErrorText, isDeleteEnabled } from '../helpers';

export function DeleteRecordsMenuItem(
  isCompacted: boolean,
  allowedActions: TopicAction[] | undefined,
  onClick: () => void
) {
  const isEnabled = isDeleteEnabled(isCompacted, allowedActions);
  const errorText = getDeleteErrorText(isCompacted, allowedActions);

  let content: JSX.Element | string = 'Delete Records';
  if (errorText) {
    content = (
      <Tooltip hasArrow label={errorText} placement="top">
        {content}
      </Tooltip>
    );
  }

  return (
    <Button isDisabled={!isEnabled} onClick={onClick} variant="outline">
      {content}
    </Button>
  );
}
