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

import { MessageMetadata } from 'components/ai-elements/message';

type UserMessageContentProps = {
  text: string;
  timestamp: Date;
};

/**
 * Renders user message content with timestamp
 */
export const UserMessageContent = ({ text, timestamp }: UserMessageContentProps) => (
  <>
    <div className="whitespace-pre-wrap">{text}</div>
    <MessageMetadata from="user" timestamp={timestamp} />
  </>
);
