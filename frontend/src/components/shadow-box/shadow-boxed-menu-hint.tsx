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

import { DropdownMenuShortcut } from 'components/redpanda-ui/components/dropdown-menu';

/**
 * A disabled menu item takes no pointer events, so a hover tooltip can't explain it. This trailing
 * hint does, for items a shadow box disables; screen readers get the whole reason.
 */
export const ShadowBoxedMenuHint = ({ reason }: { reason: string | undefined }) =>
  reason ? (
    <DropdownMenuShortcut>
      <span aria-hidden="true">Boxed</span>
      <span className="sr-only">{reason}</span>
    </DropdownMenuShortcut>
  ) : null;
