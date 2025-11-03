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

import { Actions } from 'components/ai-elements/actions';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';

type ChatMessageActionsProps = {
  role: 'user' | 'assistant';
  text: string;
};

/**
 * Action buttons for chat messages (copy only)
 */
export const ChatMessageActions = ({ role, text }: ChatMessageActionsProps) => {
  const containerClass = role === 'user' ? 'flex justify-end px-4' : 'px-4';

  return (
    <div className={containerClass}>
      <Actions>
        <CopyButton
          className="size-7 p-1.5 text-muted-foreground hover:text-foreground"
          content={text}
          size="icon"
          title="Copy message"
          variant="ghost"
        />
      </Actions>
    </div>
  );
};
