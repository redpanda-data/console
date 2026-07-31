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

import { useLayoutEffect, useState } from 'react';

import { chainToBody, documentTop } from '../utils/element-offset';

/** Read by `.page-fill-viewport` (globals.css). */
const PAGE_TOP_VAR = '--console-page-top';

/**
 * Publishes `--console-page-top`: where page content starts, measured from the document
 * top. Measured rather than hardcoded, because the chrome above a page differs per shell
 * and per route — the standalone breadcrumb row, the embedded host's header and top
 * padding, a license banner — and the host's share can change without Console shipping.
 *
 * Attach the returned ref to the element wrapping `<Outlet />`.
 */
export const usePageTopOffset = (): ((el: HTMLDivElement | null) => void) => {
  // State rather than a ref, so attaching the node re-runs the effect. The wrapper is not
  // always mounted — ErrorDisplay replaces it while the API is erroring — and has to be
  // measured again whenever it comes back.
  const [outletEl, setOutletEl] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const layoutEl = outletEl?.parentElement;
    if (!(outletEl && layoutEl)) {
      return;
    }

    // The write resizes the page, which resizes observed elements, so only write on change.
    let lastValue = '';
    const publish = () => {
      const paddingTop = Number.parseFloat(getComputedStyle(outletEl).paddingTop) || 0;
      const value = `${documentTop(outletEl) + paddingTop}px`;
      if (value !== lastValue) {
        lastValue = value;
        outletEl.style.setProperty(PAGE_TOP_VAR, value);
      }
    };

    // Only what sits above the page can push it down: the shell's wrappers (the host's
    // too, when embedded) and the chrome preceding us inside #mainLayout.
    const observer = new ResizeObserver(publish);
    const observeAll = () => {
      observer.disconnect();
      for (const el of chainToBody(layoutEl)) {
        observer.observe(el);
      }
      for (let el = outletEl.previousElementSibling; el; el = el.previousElementSibling) {
        observer.observe(el);
      }
      publish();
    };
    observeAll();

    // That chrome mounts and unmounts per route — the header is absent on pages carrying
    // their own — which changes the set to observe.
    const mutationObserver = new MutationObserver(observeAll);
    mutationObserver.observe(layoutEl, { childList: true });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
      outletEl.style.removeProperty(PAGE_TOP_VAR);
    };
  }, [outletEl]);

  return setOutletEl;
};
