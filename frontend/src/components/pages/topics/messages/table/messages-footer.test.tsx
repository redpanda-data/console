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

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { MessagesFooter, type MessagesFooterProps } from './messages-footer';

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  trigger(isIntersecting: boolean) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

const baseProps: MessagesFooterProps = {
  totalLoaded: 50,
  pageIndex: 0,
  pageSize: 10,
  onPageChange: vi.fn(),
  continuousMode: true,
  windowSize: 50,
  windowCap: 5000,
  trimmedCount: 0,
  canLoadMore: true,
  isLoadingMore: false,
  loadMoreCount: 50,
  onLoadMore: vi.fn(),
  showStats: false,
  bytesConsumed: 0,
  elapsedMs: null,
};

describe('MessagesFooter — scroll-triggered pagination', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('scrolling the bottom sentinel into view loads more, matching the "loads as you scroll" claim', () => {
    const onLoadMore = vi.fn();
    render(<MessagesFooter {...baseProps} onLoadMore={onLoadMore} />);
    expect(MockIntersectionObserver.instances).toHaveLength(1);
    MockIntersectionObserver.instances[0].trigger(true);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  test('does not load more while a load is already in flight', () => {
    const onLoadMore = vi.fn();
    render(<MessagesFooter {...baseProps} isLoadingMore onLoadMore={onLoadMore} />);
    MockIntersectionObserver.instances[0].trigger(true);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  test('does not observe anything once there is nothing left to load', () => {
    render(<MessagesFooter {...baseProps} canLoadMore={false} />);
    expect(MockIntersectionObserver.instances).toHaveLength(0);
  });

  test('the manual "Load more" button still works alongside the sentinel', async () => {
    const onLoadMore = vi.fn();
    render(<MessagesFooter {...baseProps} onLoadMore={onLoadMore} />);
    await userEvent.click(screen.getByTestId('messages-load-more'));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  test('non-continuous (paged) mode never sets up an observer', () => {
    render(<MessagesFooter {...baseProps} continuousMode={false} />);
    expect(MockIntersectionObserver.instances).toHaveLength(0);
  });
});
