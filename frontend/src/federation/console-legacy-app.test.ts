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

import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { ConsoleAppProps } from './types';

const { mockCreateRoot, mockRender, mockUnmount } = vi.hoisted(() => {
  const render = vi.fn();
  const unmount = vi.fn();
  return {
    mockCreateRoot: vi.fn(() => ({
      render,
      unmount,
    })),
    mockRender: render,
    mockUnmount: unmount,
  };
});

vi.mock('react-dom/client', () => ({
  createRoot: mockCreateRoot,
}));

vi.mock('./console-app', () => ({
  default: 'MockConsoleApp',
  ConsoleApp: 'MockConsoleApp',
}));

import ConsoleCompatApp from './console-legacy-app';

interface LegacyReactElement {
  $$typeof: symbol;
  props: { style: { height: string; width: string } };
  ref: (node: HTMLDivElement | null) => void;
  type: string;
}

const baseProps: ConsoleAppProps = {
  getAccessToken: () => Promise.resolve('token'),
  clusterId: 'cluster-1',
  config: {},
};

function legacyElement(overrides: Partial<ConsoleAppProps> = {}): LegacyReactElement {
  return ConsoleCompatApp({ ...baseProps, ...overrides }) as unknown as LegacyReactElement;
}

describe('Console legacy Module Federation app expose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns a React 18 element shape without calling React hooks', () => {
    const element = legacyElement();

    expect(element.$$typeof).toBe(Symbol.for('react.element'));
    expect(element.type).toBe('div');
    expect(element.props.style).toEqual({ height: '100%', width: '100%' });
    expect(typeof element.ref).toBe('function');
  });

  test('mounts the React 19 app through a ref callback for old React 18 hosts', () => {
    const element = legacyElement({ initialPath: '/connect' });
    const dom = {} as HTMLDivElement;

    element.ref(dom);

    expect(mockCreateRoot).toHaveBeenCalledWith(dom);
    expect(mockRender).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({ initialPath: '/connect' }),
        type: 'MockConsoleApp',
      })
    );
  });

  test('does not unmount during React ref churn on host re-render', async () => {
    const first = legacyElement({ navigateTo: '/topics' });
    const second = legacyElement({ navigateTo: '/topics/create' });
    const dom = {} as HTMLDivElement;

    first.ref(dom);
    first.ref(null);
    second.ref(dom);
    await Promise.resolve();

    expect(mockCreateRoot).toHaveBeenCalledTimes(1);
    expect(mockUnmount).not.toHaveBeenCalled();
    expect(mockRender).toHaveBeenLastCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({ navigateTo: '/topics/create' }),
        type: 'MockConsoleApp',
      })
    );
  });

  test('unmounts when the legacy host removes the container', async () => {
    const element = legacyElement();
    const dom = {} as HTMLDivElement;

    element.ref(dom);
    element.ref(null);
    await Promise.resolve();

    expect(mockUnmount).toHaveBeenCalled();
  });
});
