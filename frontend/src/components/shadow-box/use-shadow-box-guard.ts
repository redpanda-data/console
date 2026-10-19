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

import { isBlockingPhase, isBoxedReadError } from './shadow-box-model';

/** Every write a box rejects that Console offers a control for. Users and credentials stay writable. */
export type BoxedAction =
  | 'createTopic'
  | 'deleteTopic'
  | 'editTopicConfig'
  | 'produce'
  | 'deleteRecords'
  | 'editAcls'
  | 'editRoles'
  | 'editSchemas'
  | 'editConsumerOffsets'
  | 'deleteConsumerGroup';

const ACTION_PHRASE: Record<BoxedAction, string> = {
  createTopic: 'create topics',
  deleteTopic: 'delete topics',
  editTopicConfig: 'change topic configuration',
  produce: 'produce records',
  deleteRecords: 'delete records',
  editAcls: 'change ACLs',
  editRoles: 'change roles or role members',
  editSchemas: 'register, change or delete schemas',
  editConsumerOffsets: 'change consumer group offsets',
  deleteConsumerGroup: 'delete consumer groups',
};

const boxedActionReason = (action: BoxedAction) =>
  `You can’t ${ACTION_PHRASE[action]} while this cluster is shadow boxed. Unbox the cluster first.`;

/**
 * Disables write controls up front while the cluster is boxed, so users get a reason instead of a
 * raw POLICY_VIOLATION after they submit. Until a status loads, nothing is disabled.
 */
export const useShadowBoxGuard = () => {
  const { known, summary } = useShadowBoxStatusQuery();
  const fenced = known && isBlockingPhase(summary.phase);
  /** Fetches are blocked too, except for exempt principals, unless the box allows every reader. */
  const readsBlocked = fenced && !summary.allowAllReads;

  const reasonFor = useCallback(
    (action: BoxedAction): string | undefined => (fenced ? boxedActionReason(action) : undefined),
    [fenced]
  );

  /** Whether a failed message search is most likely the box turning Console's fetch away. */
  const isBoxedRead = useCallback(
    (message: string): boolean => readsBlocked && isBoxedReadError(message),
    [readsBlocked]
  );

  return { fenced, readsBlocked, reasonFor, isBoxedRead };
};
