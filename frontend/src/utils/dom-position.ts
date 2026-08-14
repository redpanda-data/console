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

/** Distance from the document top. Unlike getBoundingClientRect, scroll-independent. */
export const documentTop = (target: HTMLElement): number => {
  let top = 0;
  let el: HTMLElement | null = target;
  while (el) {
    top += el.offsetTop;
    el = el.offsetParent instanceof HTMLElement ? el.offsetParent : null;
  }
  return top;
};

/** `from` and its ancestors, up to but excluding `<body>`. */
export const chainToBody = (from: HTMLElement | null): HTMLElement[] => {
  const chain: HTMLElement[] = [];
  for (let el = from; el && el !== document.body; el = el.parentElement) {
    chain.push(el);
  }
  return chain;
};
