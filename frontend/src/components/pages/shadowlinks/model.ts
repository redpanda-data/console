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

import { ShadowLinkState } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';

/**
 * Converts ShadowLinkState enum to human-readable string
 */
export function getShadowLinkStateLabel(state: ShadowLinkState): string {
  switch (state) {
    case ShadowLinkState.ACTIVE:
      return 'Running';
    case ShadowLinkState.PAUSED:
      return 'Paused';
    default:
      return 'Unknown';
  }
}
