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

type ClickIntent = {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  button: number;
};

/**
 * Whether a click carries a modifier or a non-primary button. Those mean "open in a new tab/window",
 * so a container that navigates on click (a table row, a card) must leave them to the browser and let
 * the real anchor inside handle them.
 */
export const isModifiedClick = (event: ClickIntent): boolean =>
  event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
