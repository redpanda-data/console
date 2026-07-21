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

import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import ConsoleApp from './console-app';
import type { ConsoleAppProps } from './types';

const LEGACY_REACT_ELEMENT_TYPE = Symbol.for('react.element');
const LEGACY_CONTAINER_STYLE = { height: '100%', width: '100%' } as const;

interface LegacyRootState {
  root: Root;
  version: number;
}

interface LegacyReactElement {
  _owner: null;
  _store: Record<string, never>;
  $$typeof: symbol;
  key: null;
  props: { style: typeof LEGACY_CONTAINER_STYLE };
  ref: (node: HTMLDivElement | null) => void;
  type: 'div';
}

const roots = new WeakMap<HTMLDivElement, LegacyRootState>();

function renderIntoLegacyHostContainer(node: HTMLDivElement, props: ConsoleAppProps): number {
  const existingState = roots.get(node);
  const state = existingState ?? { root: createRoot(node), version: 0 };
  state.version += 1;
  roots.set(node, state);
  state.root.render(createElement(ConsoleApp, props));
  return state.version;
}

function scheduleUnmount(node: HTMLDivElement, version: number): void {
  queueMicrotask(() => {
    const state = roots.get(node);
    if (!state || state.version !== version) {
      return;
    }
    state.root.unmount();
    roots.delete(node);
  });
}

function createLegacyHostRef(props: ConsoleAppProps) {
  let currentNode: HTMLDivElement | null = null;
  let currentVersion = 0;

  return (node: HTMLDivElement | null) => {
    if (node) {
      currentNode = node;
      currentVersion = renderIntoLegacyHostContainer(node, props);
      return;
    }
    if (!currentNode) {
      return;
    }
    const nodeToUnmount = currentNode;
    const versionToUnmount = currentVersion;
    currentNode = null;
    scheduleUnmount(nodeToUnmount, versionToUnmount);
  };
}

/**
 * Compatibility export for old Cloud UI hosts that still render `rp_console/App`
 * as a plain React component. The function intentionally does not call React
 * hooks. It returns the React 18 element object shape directly and uses the div
 * ref to mount the real React 19 Console tree with this bundle's `createRoot`.
 */
export default function ConsoleCompatApp(props: ConsoleAppProps): LegacyReactElement {
  return {
    $$typeof: LEGACY_REACT_ELEMENT_TYPE,
    _owner: null,
    _store: {},
    key: null,
    props: { style: LEGACY_CONTAINER_STYLE },
    ref: createLegacyHostRef(props),
    type: 'div',
  };
}
