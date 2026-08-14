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

import { type ReactNode, useLayoutEffect, useState } from 'react';

import { chainToBody, documentTop } from '../../utils/dom-position';

/** Read by `.page-fill-viewport` (globals.css). */
const PAGE_TOP_VAR = '--console-page-top';

/**
 * Publishes `--console-page-top`: where page content starts, from the document top.
 * Measured, not hardcoded — the chrome above a page differs per shell and per route, and
 * the host's share of it can change without Console shipping.
 */
const usePublishPageTop = () => {
  // State, not a ref, so re-attaching re-runs the effect: ErrorDisplay swaps the column
  // out while the API is erroring, and it must be re-measured when it comes back.
  const [columnEl, setColumnEl] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const layoutEl = columnEl?.parentElement;
    if (!(columnEl && layoutEl)) {
      return;
    }

    // The write resizes the page, which resizes observed elements, so only write on change.
    let lastValue = '';
    const publish = () => {
      const paddingTop = Number.parseFloat(getComputedStyle(columnEl).paddingTop) || 0;
      const value = `${documentTop(columnEl) + paddingTop}px`;
      if (value !== lastValue) {
        lastValue = value;
        columnEl.style.setProperty(PAGE_TOP_VAR, value);
      }
    };

    // Only what sits above can push the page down: the shell's wrappers (the host's too,
    // when embedded) and the preceding chrome inside #mainLayout.
    const observer = new ResizeObserver(publish);
    const observeAll = () => {
      observer.disconnect();
      for (const el of chainToBody(layoutEl)) {
        observer.observe(el);
      }
      for (let el = columnEl.previousElementSibling; el; el = el.previousElementSibling) {
        observer.observe(el);
      }
      publish();
    };
    observeAll();

    // That chrome mounts and unmounts per route, changing the set to observe.
    const mutationObserver = new MutationObserver(observeAll);
    mutationObserver.observe(layoutEl, { childList: true });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
      columnEl.style.removeProperty(PAGE_TOP_VAR);
    };
  }, [columnEl]);

  return setColumnEl;
};

/**
 * The column every page renders into: the gap below the app header, plus the offset
 * `page-fill-viewport` pages size against. Must sit directly inside `#mainLayout`.
 */
export const PageColumn = ({ children }: { children: ReactNode }) => {
  const ref = usePublishPageTop();

  return (
    <div className="pt-8" ref={ref}>
      {children}
    </div>
  );
};
