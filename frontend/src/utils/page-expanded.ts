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

/**
 * Full-width page mode, in normal document flow. While this attribute is on
 * `<html>`, every shell releases its horizontal constraints via CSS in lockstep:
 * Console's gutter/max-width (index.scss) and Cloud UI's embedded wrapper
 * (`expandableWidth` in cloud-ui layout.tsx). Always remove on unmount — a stale
 * attribute bleeds full-width onto the next page.
 */
export const PAGE_EXPANDED_ATTR = 'data-page-expanded';

export const setPageExpanded = (expanded: boolean) => {
  const root = document.documentElement;
  if (expanded) {
    root.setAttribute(PAGE_EXPANDED_ATTR, '');
  } else {
    root.removeAttribute(PAGE_EXPANDED_ATTR);
  }
};
