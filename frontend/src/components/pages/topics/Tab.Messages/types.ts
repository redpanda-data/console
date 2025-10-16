/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { Topic } from '../../../../state/rest-interfaces';

export type TopicMessageViewProps = {
  topic: Topic;
  refreshTopicData: (force: boolean) => void;
};

export type TopicMessageViewInternalProps = TopicMessageViewProps & {
  partitionID: number;
  maxResults: number;
  startOffset: number;
  quickSearch: string;
  setPartitionID: (val: number) => void;
  setMaxResults: (val: number) => void;
  setStartOffset: (val: number) => void;
  setQuickSearch: (val: string) => void;
  showColumnSettingsModal: boolean;
  setShowColumnSettingsModal: (val: boolean) => void;
  showPreviewFieldsModal: boolean;
  setShowPreviewFieldsModal: (val: boolean) => void;
  showDeserializersModal: boolean;
  setShowDeserializersModal: (val: boolean) => void;
};

export type TopicMessageParams = {
  partitionID: number;
  maxResults: number;
  startOffset: number;
  quickSearch: string;
};
