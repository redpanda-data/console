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

import { describe, expect, it, rs } from '@rstest/core';
import { render, screen } from 'test-utils';

const platform = rs.hoisted(() => ({ mac: false }));
rs.mock('utils/platform', () => ({ isMacOS: () => platform.mac }));

import { EditorTipsBar } from './editor-tips-bar';

function renderVisualTips(mac: boolean) {
  platform.mac = mac;
  render(<EditorTipsBar context="visual" />);
}

describe('EditorTipsBar — shortcut chip formatting', () => {
  it('joins keys with "+" and spells out modifiers off macOS (Alt+Z, Ctrl+Z, Ctrl+Shift+Z)', () => {
    renderVisualTips(false);
    expect(screen.getByText('Alt+Z')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+Z')).toBeInTheDocument();
    expect(screen.getByText('Ctrl+Shift+Z')).toBeInTheDocument();
  });

  it('runs glyphs together on macOS (⌥Z, ⌘Z, ⌘⇧Z)', () => {
    renderVisualTips(true);
    expect(screen.getByText('⌥Z')).toBeInTheDocument();
    expect(screen.getByText('⌘Z')).toBeInTheDocument();
    expect(screen.getByText('⌘⇧Z')).toBeInTheDocument();
  });
});
