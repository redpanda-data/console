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

import { isBoxedReadError } from './shadow-box-model';

/**
 * Every change a box rejects that Console offers a control for. Topic config changes, DeleteRecords,
 * users and SCRAM passwords still go through, so they aren't here.
 */
export type BoxedAction =
  | 'createTopic'
  | 'deleteTopic'
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
  produce: 'produce records',
  editAcls: 'create or delete ACLs',
  editRoles: 'create, change or delete roles',
  editSchemas: 'register, change or delete schemas',
  editConsumerOffsets: 'commit, change or delete consumer group offsets',
  deleteConsumerGroup: 'delete consumer groups',
};

const boxedActionReason = (action: BoxedAction) =>
  action === 'createShadowLink'
    ? 'A shadow boxed cluster rejects new shadow links, and retrying won’t help. Unbox it first.'
    : `You can’t ${ACTION_PHRASE[action]} while this cluster is shadow boxed. Unbox it first.`;

/** For pages whose changes still go through while boxed, but may not reach a shadow cluster in time. */
export const BOXED_TOPIC_CONFIG_NOTE =
  'This cluster is shadow boxed. Topic config changes still go through, but a shadow link copies some topic properties, so a change made now may not reach the shadow before you fail over.';

/**
 * Disables write controls up front while the cluster blocks, so users get a reason instead of a
 * raw POLICY_VIOLATION after they submit. Until a status loads, nothing is disabled.
 */
export const useShadowBoxGuard = () => {
  const { blocking, summary } = useShadowBoxStatusQuery();
  /** Fetches are blocked too, except for exempt users, unless the box allows every reader. */
  const readsBlocked = blocking && !summary.allowAllReads;

  const reasonFor = useCallback(
    (action: BoxedAction): string | undefined => (blocking ? boxedActionReason(action) : undefined),
    [blocking]
  );

  /** Whether a failed message search is most likely the box turning Console's fetch away. */
  const isBoxedRead = useCallback(
    (message: string): boolean => readsBlocked && isBoxedReadError(message),
    [readsBlocked]
  );

  return { fenced: blocking, readsBlocked, reasonFor, isBoxedRead };
};
