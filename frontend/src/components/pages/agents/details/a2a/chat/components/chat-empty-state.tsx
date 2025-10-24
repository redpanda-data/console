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

import { ConversationEmptyState } from 'components/ai-elements/conversation';
import { MessageSquareIcon } from 'lucide-react';

/**
 * Empty state component displayed when there are no messages
 */
export const ChatEmptyState = () => (
  <ConversationEmptyState
    description="Send a message to start chatting with this agent"
    icon={<MessageSquareIcon className="size-12" />}
    title="No messages yet"
  />
);
