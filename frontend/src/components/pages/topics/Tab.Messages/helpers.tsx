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

import type { TopicAction } from '../../../../state/rest-interfaces';
import { Feature, isSupported } from '../../../../state/supported-features';

/**
 * Checks if user has privilege to delete records
 */
export function hasDeleteRecordsPrivilege(allowedActions: TopicAction[] | undefined): boolean {
  // undefined has the same meaning as 'all'
  return !allowedActions || allowedActions.includes('deleteTopicRecords') || allowedActions.includes('all');
}

/**
 * Checks if deletion is enabled for a topic
 */
export function isDeleteEnabled(isCompacted: boolean, allowedActions: TopicAction[] | undefined): boolean {
  return !isCompacted && hasDeleteRecordsPrivilege(allowedActions) && isSupported(Feature.DeleteRecords);
}

/**
 * Gets error message for why deletion is disabled
 */
export function getDeleteErrorText(
  isCompacted: boolean,
  allowedActions: TopicAction[] | undefined
): string | undefined {
  if (isCompacted) {
    return "Records on Topics with the 'compact' cleanup policy cannot be deleted.";
  }
  if (!hasDeleteRecordsPrivilege(allowedActions)) {
    return "You're not permitted to delete records on this topic.";
  }
  if (!isSupported(Feature.DeleteRecords)) {
    return "The cluster doesn't support deleting records.";
  }
  return undefined;
}
