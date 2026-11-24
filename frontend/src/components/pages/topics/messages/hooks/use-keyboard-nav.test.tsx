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

import { describe, expect, test } from '@rstest/core';
import { act, fireEvent, renderHook } from '@testing-library/react';
import { useState } from 'react';

import { useKeyboardNav } from './use-keyboard-nav';

const values = new Map([
  ['a', '{"status":"created"}'],
  ['b', '{"status":"shipped"}'],
  ['c', '{"status":"delivered"}'],
]);
const visibleKeys = [...values.keys()];
const getCopyText = (key: string) => values.get(key);

const renderNav = (enabled = true) =>
  renderHook(() => {
    const [selectedKey, onSelect] = useState<string | null>('a');
    useKeyboardNav({ visibleKeys, selectedKey, onSelect, getCopyText, enabled });
    return selectedKey;
  });

const pressKeys = (...events: KeyboardEvent[]) =>
  act(() => {
    for (const event of events) {
      fireEvent(window, event);
    }
    return Promise.resolve();
  });

const keyDown = (key: string, modifiers: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { key, cancelable: true, ...modifiers });

describe('useKeyboardNav', () => {
  test('plain "c" copies the selected row’s JSON value', async () => {
    await navigator.clipboard.writeText('previous value');
    renderNav();

    await pressKeys(keyDown('c'));

    expect(await navigator.clipboard.readText()).toBe('{"status":"created"}');
  });

  test('modified copy keys leave the clipboard and browser shortcuts alone', async () => {
    await navigator.clipboard.writeText('previous value');
    renderNav();

    const events = [keyDown('c', { metaKey: true }), keyDown('c', { ctrlKey: true }), keyDown('c', { altKey: true })];
    await pressKeys(...events);

    expect(events.map((event) => event.defaultPrevented)).toEqual([false, false, false]);
    expect(await navigator.clipboard.readText()).toBe('previous value');
  });

  test('j/k move selection down and up', async () => {
    const { result } = renderNav();

    await pressKeys(keyDown('j'));
    expect(result.current).toBe('b');
    await pressKeys(keyDown('k'));
    expect(result.current).toBe('a');
  });

  test('disabled shortcuts do not move selection or copy the selected value', async () => {
    await navigator.clipboard.writeText('previous value');
    const { result } = renderNav(false);

    await pressKeys(keyDown('j'));
    await pressKeys(keyDown('c'));

    expect(result.current).toBe('a');
    expect(await navigator.clipboard.readText()).toBe('previous value');
  });
});
