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

import { TopicMessagesView } from './topic-messages-view';
import { useBooleanFlagValue } from '../../../../custom-feature-flag-provider';
import type { Topic } from '../../../../state/rest-interfaces';
import { TopicMessageView } from '../Tab.Messages';

export type TopicMessagesTabProps = {
  topic: Topic;
  refreshTopicData: (force: boolean) => void;
};

/**
 * Messages tab entry point: renders the redesigned viewer when
 * `enableNewTopicMessagesPage` is on, otherwise the legacy `TopicMessageView`.
 */
export const TopicMessagesTab = ({ topic, refreshTopicData }: TopicMessagesTabProps) => {
  const useNewMessagesPage = useBooleanFlagValue('enableNewTopicMessagesPage');

  if (useNewMessagesPage) {
    return <TopicMessagesView topic={topic} />;
  }

  return <TopicMessageView refreshTopicData={refreshTopicData} topic={topic} />;
};
