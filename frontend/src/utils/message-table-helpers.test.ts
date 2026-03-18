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

import { describe, expect, test } from 'vitest';

import { isFilterMatch, trimSlidingWindow } from './message-table-helpers';
import type { TopicMessage } from '../state/rest-interfaces';

function makeMessage(overrides: Partial<TopicMessage> = {}): TopicMessage {
  return {
    offset: 0,
    keyJson: '',
    valueJson: '',
    ...overrides,
  } as unknown as TopicMessage;
}

describe('isFilterMatch', () => {
  test('matches against offset as string', () => {
    const msg = makeMessage({ offset: 12_345 });
    expect(isFilterMatch('123', msg)).toBe(true);
    expect(isFilterMatch('12345', msg)).toBe(true);
  });

  test('matches against keyJson case-insensitively', () => {
    const msg = makeMessage({ keyJson: 'MyKeyValue' });
    expect(isFilterMatch('mykeyvalue', msg)).toBe(true);
    expect(isFilterMatch('MYKEY', msg)).toBe(true);
    expect(isFilterMatch('KeyVal', msg)).toBe(true);
  });

  test('matches against valueJson case-insensitively', () => {
    const msg = makeMessage({ valueJson: '{"name":"Alice"}' });
    expect(isFilterMatch('alice', msg)).toBe(true);
    expect(isFilterMatch('NAME', msg)).toBe(true);
  });

  test('returns false when no field matches', () => {
    const msg = makeMessage({ offset: 1, keyJson: 'key', valueJson: 'value' });
    expect(isFilterMatch('zzz', msg)).toBe(false);
  });

  test('handles undefined keyJson and valueJson', () => {
    const msg = makeMessage({ offset: 5 });
    // Explicitly set to undefined to simulate missing fields
    (msg as Record<string, unknown>).keyJson = undefined;
    (msg as Record<string, unknown>).valueJson = undefined;

    expect(isFilterMatch('5', msg)).toBe(true);
    expect(isFilterMatch('abc', msg)).toBe(false);
  });

  test('empty search string matches everything', () => {
    const msg = makeMessage({ offset: 0, keyJson: '', valueJson: '' });
    expect(isFilterMatch('', msg)).toBe(true);
  });
});

describe('trimSlidingWindow', () => {
  function makeMessages(count: number): TopicMessage[] {
    return Array.from({ length: count }, (_, i) => makeMessage({ offset: i }));
  }

  test('returns unchanged when messages fit within maxWindowSize', () => {
    const messages = makeMessages(20);
    const result = trimSlidingWindow({
      messages,
      maxResults: 100,
      pageSize: 50,
      currentGlobalPage: 0,
      windowStartPage: 0,
      virtualStartIndex: 0,
    });
    expect(result.trimCount).toBe(0);
    expect(result.messages).toBe(messages); // same reference
  });

  test('returns unchanged when maxResults < pageSize', () => {
    const messages = makeMessages(200);
    const result = trimSlidingWindow({
      messages,
      maxResults: 10,
      pageSize: 50,
      currentGlobalPage: 5,
      windowStartPage: 0,
      virtualStartIndex: 0,
    });
    expect(result.trimCount).toBe(0);
    expect(result.messages).toBe(messages);
  });

  test('trims pages before the current view', () => {
    // 250 messages, pageSize=50, maxResults=100 => maxWindowSize=150
    // excess = 250 - 150 = 100 => 2 pages of 50
    // currentGlobalPage=4, windowStartPage=0 => currentLocalPage=4
    // maxPagesToTrim = max(0, 4-1) = 3
    // pagesToTrim = min(2, 3) = 2
    // trimCount = 100
    const messages = makeMessages(250);
    const result = trimSlidingWindow({
      messages,
      maxResults: 100,
      pageSize: 50,
      currentGlobalPage: 4,
      windowStartPage: 0,
      virtualStartIndex: 0,
    });
    expect(result.trimCount).toBe(100);
    expect(result.messages.length).toBe(150);
    expect(result.windowStartPage).toBe(2);
    expect(result.virtualStartIndex).toBe(100);
  });

  test('never trims current page or page before it', () => {
    // 200 messages, pageSize=50, maxResults=100 => maxWindowSize=150
    // excess = 50 => 1 page worth
    // currentGlobalPage=1, windowStartPage=0 => currentLocalPage=1
    // maxPagesToTrim = max(0, 1-1) = 0
    // pagesToTrim = min(1, 0) = 0
    const messages = makeMessages(200);
    const result = trimSlidingWindow({
      messages,
      maxResults: 100,
      pageSize: 50,
      currentGlobalPage: 1,
      windowStartPage: 0,
      virtualStartIndex: 0,
    });
    expect(result.trimCount).toBe(0);
    expect(result.messages).toBe(messages);
  });

  test('trimCount is always a multiple of pageSize', () => {
    // 300 messages, pageSize=50, maxResults=100 => maxWindowSize=150
    // excess = 150 => 3 pages
    // currentGlobalPage=5, windowStartPage=0 => currentLocalPage=5
    // maxPagesToTrim = max(0, 5-1) = 4
    // pagesToTrim = min(3, 4) = 3
    // trimCount = 150
    const messages = makeMessages(300);
    const result = trimSlidingWindow({
      messages,
      maxResults: 100,
      pageSize: 50,
      currentGlobalPage: 5,
      windowStartPage: 0,
      virtualStartIndex: 0,
    });
    expect(result.trimCount).toBe(150);
    expect(result.trimCount % 50).toBe(0);
  });

  test('updates windowStartPage and virtualStartIndex correctly', () => {
    const messages = makeMessages(250);
    const result = trimSlidingWindow({
      messages,
      maxResults: 100,
      pageSize: 50,
      currentGlobalPage: 7,
      windowStartPage: 3,
      virtualStartIndex: 200,
    });
    // currentLocalPage = max(0, 7-3) = 4
    // excess = 250-150 = 100 => floor(100/50) = 2
    // maxPagesToTrim = max(0, 4-1) = 3
    // pagesToTrim = min(2, 3) = 2
    // trimCount = 100
    expect(result.trimCount).toBe(100);
    expect(result.windowStartPage).toBe(3 + 2);
    expect(result.virtualStartIndex).toBe(200 + 100);
    expect(result.messages.length).toBe(150);
  });

  test('returns trimCount 0 when user is on first pages', () => {
    const messages = makeMessages(200);
    const result = trimSlidingWindow({
      messages,
      maxResults: 100,
      pageSize: 50,
      currentGlobalPage: 0,
      windowStartPage: 0,
      virtualStartIndex: 0,
    });
    // currentLocalPage=0, maxPagesToTrim=max(0,-1)=0
    expect(result.trimCount).toBe(0);
    expect(result.messages).toBe(messages);
  });
});
