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

import { renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { useKeyboardNav } from './use-keyboard-nav';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const renderNav = (overrides: Partial<Parameters<typeof useKeyboardNav>[0]> = {}) => {
  const onSelect = vi.fn();
  const getCopyText = vi.fn((key: string) => `copy-text-for-${key}`);
  renderHook(() =>
    useKeyboardNav({
      visibleKeys: ['a', 'b', 'c'],
      selectedKey: 'a',
      onSelect,
      getCopyText,
      enabled: true,
      ...overrides,
    })
  );
  return { onSelect, getCopyText };
};

describe('useKeyboardNav', () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('plain "c" copies the selected row\'s value', async () => {
    const { getCopyText } = renderNav();
    await userEvent.keyboard('c');
    expect(getCopyText).toHaveBeenCalledWith('a');
    expect(writeText).toHaveBeenCalledWith('copy-text-for-a');
  });

  test("Cmd+C / Ctrl+C / Alt+C do not hijack the browser's own copy shortcut", async () => {
    const { getCopyText } = renderNav();
    await userEvent.keyboard('{Meta>}c{/Meta}');
    await userEvent.keyboard('{Control>}c{/Control}');
    await userEvent.keyboard('{Alt>}c{/Alt}');
    expect(getCopyText).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  test('j/k still move selection with no modifiers', async () => {
    const { onSelect } = renderNav();
    await userEvent.keyboard('j');
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  test('disabled means no listener at all', async () => {
    const { onSelect, getCopyText } = renderNav({ enabled: false });
    await userEvent.keyboard('j');
    await userEvent.keyboard('c');
    expect(onSelect).not.toHaveBeenCalled();
    expect(getCopyText).not.toHaveBeenCalled();
  });
});
