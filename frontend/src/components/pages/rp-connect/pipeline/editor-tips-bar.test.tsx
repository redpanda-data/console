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

import { render, screen } from 'test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The tips bar derives its key-chip text from the platform at module load, so each test picks the
// platform first, then imports a fresh copy of the module.
const platform = vi.hoisted(() => ({ mac: false }));
vi.mock('utils/platform', () => ({ isMacOS: () => platform.mac }));

async function renderVisualTips(mac: boolean) {
  platform.mac = mac;
  vi.resetModules();
  const { EditorTipsBar } = await import('./editor-tips-bar');
  render(<EditorTipsBar context="visual" />);
}

describe('EditorTipsBar — shortcut chip formatting', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('joins keys with "+" and spells out modifiers off macOS (Alt+Z, Ctrl+Z, Ctrl+Shift+Z)', async () => {
    await renderVisualTips(false);
    expect(screen.getByText('Alt+Z')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+Z')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+Shift+Z')).toBeInTheDocument();
  });

  it('runs glyphs together on macOS (⌥Z, ⌘Z, ⌘⇧Z)', async () => {
    await renderVisualTips(true);
    expect(screen.getByText('⌥Z')).toBeInTheDocument();
    expect(screen.getByText('⌘Z')).toBeInTheDocument();
    expect(screen.getByText('⌘⇧Z')).toBeInTheDocument();
  });
});
