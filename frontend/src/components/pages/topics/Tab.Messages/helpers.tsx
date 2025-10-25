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

/**
 * Gets the name of a control character by its ASCII code
 */
export function getControlCharacterName(code: number): string {
  switch (code) {
    case 0:
      return 'NUL';
    case 1:
      return 'SOH';
    case 2:
      return 'STX';
    case 3:
      return 'ETX';
    case 4:
      return 'EOT';
    case 5:
      return 'ENQ';
    case 6:
      return 'ACK';
    case 7:
      return 'BEL';
    case 8:
      return 'BS';
    case 9:
      return 'HT';
    case 10:
      return 'LF';
    case 11:
      return 'VT';
    case 12:
      return 'FF';
    case 13:
      return 'CR';
    case 14:
      return 'SO';
    case 15:
      return 'SI';
    case 16:
      return 'DLE';
    case 17:
      return 'DC1';
    case 18:
      return 'DC2';
    case 19:
      return 'DC3';
    case 20:
      return 'DC4';
    case 21:
      return 'NAK';
    case 22:
      return 'SYN';
    case 23:
      return 'ETB';
    case 24:
      return 'CAN';
    case 25:
      return 'EM';
    case 26:
      return 'SUB';
    case 27:
      return 'ESC';
    case 28:
      return 'FS';
    case 29:
      return 'GS';
    case 30:
      return 'RS';
    case 31:
      return 'US';
    default:
      return '';
  }
}
