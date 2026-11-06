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

import { useCallback } from 'react';
import { useShadowBoxStatusQuery } from 'react-query/api/shadow-box';

import { isBoxedReadError, isFencedTopic, isFencedTopicWrite } from './shadow-box-model';

/**
 * Every change a fence rejects that Console offers a control for. DeleteRecords, users and SCRAM
 * passwords still go through, so they aren't here.
 */
export type BoxedAction =
  | 'createTopic'
  | 'deleteTopic'
  | 'editTopicConfig'
  | 'produce'
  | 'editAcls'
  | 'editRoles'
  | 'editSchemas'
  | 'editConsumerOffsets'
  | 'deleteConsumerGroup'
  | 'createShadowLink';

const ACTION_PHRASE: Record<Exclude<BoxedAction, 'createShadowLink'>, string> = {
  createTopic: 'create topics or add partitions',
  deleteTopic: 'delete topics',
  editTopicConfig: 'change topic configuration',
  produce: 'produce records',
  editAcls: 'create or delete ACLs',
  editRoles: 'create, change or delete roles',
  editSchemas: 'register, change or delete schemas',
  editConsumerOffsets: 'commit, change or delete consumer group offsets',
  deleteConsumerGroup: 'delete consumer groups',
};

/** For a topic action, whether the fence covers that topic: internal topics stay open. */
const TOPIC_IN_SCOPE: Partial<Record<BoxedAction, (topic: string) => boolean>> = {
  createTopic: isFencedTopic,
  deleteTopic: isFencedTopic,
  editTopicConfig: isFencedTopic,
  produce: isFencedTopicWrite,
};

const boxedActionReason = (action: BoxedAction) =>
  action === 'createShadowLink'
    ? 'A fenced cluster rejects new shadow links, and retrying won’t help. Unfence it first.'
    : `You can’t ${ACTION_PHRASE[action]} while this cluster is fenced. Unfence it first.`;

/**
 * Disables write controls up front while the cluster blocks, so users get a reason instead of a
 * raw POLICY_VIOLATION after they submit. Until a status loads, nothing is disabled.
 */
export const useShadowBoxGuard = () => {
  const { blocking, summary } = useShadowBoxStatusQuery();
  const readsBlocked = blocking && !summary.allowAllReads;

  /** Pass `topic` for a change to one topic, so the fence's internal-topic exemption applies. */
  const reasonFor = useCallback(
    (action: BoxedAction, topic?: string): string | undefined => {
      const covered = topic === undefined || (TOPIC_IN_SCOPE[action]?.(topic) ?? true);
      return blocking && covered ? boxedActionReason(action) : undefined;
    },
    [blocking]
  );

  /** Whether a failed message search is most likely the box turning Console's fetch away. */
  const isBoxedRead = useCallback(
    (message: string): boolean => readsBlocked && isBoxedReadError(message),
    [readsBlocked]
  );

  return { reasonFor, isBoxedRead };
};
