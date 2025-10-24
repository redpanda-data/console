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

import { Action, Actions } from 'components/ai-elements/actions';
import { CopyIcon, PencilIcon, RefreshCcwIcon } from 'lucide-react';

type ChatMessageActionsProps = {
  role: 'user' | 'assistant';
  text: string;
  isLastMessage: boolean;
  onEdit?: () => void;
  onRetry?: () => void;
};

/**
 * Action buttons for chat messages (edit, copy, retry)
 */
export const ChatMessageActions = ({ role, text, isLastMessage, onEdit, onRetry }: ChatMessageActionsProps) => {
  if (role === 'user') {
    return (
      <div className="flex justify-end px-4">
        <Actions>
          <Action label="Edit" onClick={onEdit}>
            <PencilIcon className="size-3" />
          </Action>
          <Action label="Copy" onClick={() => navigator.clipboard.writeText(text)}>
            <CopyIcon className="size-3" />
          </Action>
        </Actions>
      </div>
    );
  }

  return (
    <div className="ml-10 px-4">
      <Actions>
        <Action label="Copy" onClick={() => navigator.clipboard.writeText(text)}>
          <CopyIcon className="size-3" />
        </Action>
        {isLastMessage && (
          <Action label="Retry" onClick={onRetry}>
            <RefreshCcwIcon className="size-3" />
          </Action>
        )}
      </Actions>
    </div>
  );
};
