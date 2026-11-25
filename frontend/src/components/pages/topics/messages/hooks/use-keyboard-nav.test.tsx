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

import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { renderHook, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { useKeyboardNav } from './use-keyboard-nav';

rs.mock('sonner', () => ({ toast: { success: rs.fn(), error: rs.fn() } }));

const renderNav = (overrides: Partial<Parameters<typeof useKeyboardNav>[0]> = {}) => {
  const onSelect = rs.fn();
  const getCopyText = rs.fn((key: string) => `copy-text-for-${key}`);
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
  let writeText: ReturnType<typeof rs.fn>;
  let originalClipboard: PropertyDescriptor | undefined;

  beforeEach(() => {
    rs.clearAllMocks();
    originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    writeText = rs.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  });

  afterEach(() => {
    rs.restoreAllMocks();
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  describe('copy shortcuts', () => {
    test('plain "c" copies the selected row\'s value', async () => {
      const { getCopyText } = renderNav();
      await userEvent.keyboard('c');
      expect(getCopyText).toHaveBeenCalledWith('a');
      expect(writeText).toHaveBeenCalledWith('copy-text-for-a');
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Value copied to clipboard'));
    });

    test('reports every rejected clipboard attempt without a success notification', async () => {
      writeText.mockRejectedValue(new Error('Clipboard permission denied'));
      renderNav();
      await userEvent.keyboard('c');
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Failed to copy value', { description: 'Clipboard permission denied' })
      );
      expect(toast.success).not.toHaveBeenCalled();
      await userEvent.keyboard('c');
      await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2));
    });

    test('explains when clipboard access is unavailable', async () => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
      renderNav();
      await userEvent.keyboard('c');
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Failed to copy value', {
          description: 'Clipboard access is unavailable.',
        })
      );
      expect(writeText).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
    });

    test('keeps empty values as a no-op', async () => {
      renderNav({ getCopyText: () => '' });
      await userEvent.keyboard('c');
      expect(writeText).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    test("cmd+C / Ctrl+C / Alt+C do not hijack the browser's own copy shortcut", async () => {
      const { getCopyText } = renderNav();
      await userEvent.keyboard('{Meta>}c{/Meta}');
      await userEvent.keyboard('{Control>}c{/Control}');
      await userEvent.keyboard('{Alt>}c{/Alt}');
      expect(getCopyText).not.toHaveBeenCalled();
      expect(writeText).not.toHaveBeenCalled();
    });
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
