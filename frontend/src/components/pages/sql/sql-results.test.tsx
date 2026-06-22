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

import userEvent from '@testing-library/user-event';
import { render, screen } from 'test-utils';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { SqlResults } from './sql-results';
import type { QueryRunSuccess, SqlRole } from './sql-types';

// react-data-grid virtualizes rows and columns against the grid root's
// measured size, which happy-dom reports as 0 — culling every column.
// Give the .rdg root a real viewport so all columns and rows render;
// other elements keep zero size so 'max-content' column measuring falls
// back to minWidth instead of exploding past the viewport.
const GRID_RECT = { width: 1920, height: 600 };

beforeAll(() => {
  const proto = HTMLDivElement.prototype;
  const original = proto.getBoundingClientRect;
  const isGridRoot = (el: Element) => el.classList.contains('rdg');

  proto.getBoundingClientRect = function (this: HTMLDivElement) {
    if (!isGridRoot(this)) {
      return original.call(this);
    }
    return { ...original.call(this), width: GRID_RECT.width, height: GRID_RECT.height };
  };
  for (const [prop, value] of [
    ['clientWidth', GRID_RECT.width],
    ['clientHeight', GRID_RECT.height],
    ['offsetWidth', GRID_RECT.width],
    ['offsetHeight', GRID_RECT.height],
  ] as const) {
    Object.defineProperty(proto, prop, {
      configurable: true,
      get(this: HTMLDivElement) {
        return isGridRoot(this) ? value : 0;
      },
    });
  }
  Reflect.set(proto, '__rdgRectRestore', original);
});

afterAll(() => {
  const proto = HTMLDivElement.prototype;
  const original = Reflect.get(proto, '__rdgRectRestore') as typeof proto.getBoundingClientRect;
  proto.getBoundingClientRect = original;
  for (const prop of ['clientWidth', 'clientHeight', 'offsetWidth', 'offsetHeight']) {
    Reflect.deleteProperty(proto, prop);
  }
  Reflect.deleteProperty(proto, '__rdgRectRestore');
});

const LONG_VALUE = `{"payload":"${'x'.repeat(120)}"}`;
const viewer: SqlRole = 'viewer';

const run: QueryRunSuccess = {
  state: 'success',
  token: 1,
  columns: [
    { name: 'id', type: 'TEXT', kind: 'str', short: 'text' },
    { name: 'doc', type: 'TEXT', kind: 'str', short: 'text' },
  ],
  rows: [{ id: 'row-1', doc: LONG_VALUE }],
  totalRows: 1,
  elapsedMs: 3,
  truncated: false,
};

describe('SqlResults cell clamping', () => {
  test('short values render as plain text without a click target', () => {
    render(<SqlResults run={run} sqlRole={viewer} />);
    const short = screen.getByText('row-1');
    expect(short.closest('button')).toBeNull();
  });

  test('long values truncate and open the full value in a popover on click', async () => {
    render(<SqlResults run={run} sqlRole={viewer} />);
    const trigger = screen.getByRole('button', { name: LONG_VALUE });
    expect(trigger.className).toContain('truncate');

    await userEvent.click(trigger);
    const occurrences = await screen.findAllByText(LONG_VALUE);
    expect(occurrences.length).toBeGreaterThan(1);
  });
});

describe('SqlResults create-table hint', () => {
  test('admin create errors can open the add-topic wizard', async () => {
    const onAddTable = vi.fn();
    render(
      <SqlResults
        onAddTable={onAddTable}
        run={{
          state: 'error',
          token: 2,
          title: 'Use the wizard to create tables',
          message: "CREATE TABLE isn't run from the editor in this release.",
          hint: 'Creating a table from a topic?',
          hintAction: true,
        }}
        sqlRole="admin"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add a topic to SQL' }));

    expect(onAddTable).toHaveBeenCalledOnce();
  });

  test('viewer create errors do not show the add-topic action', () => {
    render(
      <SqlResults
        onAddTable={vi.fn()}
        run={{
          state: 'error',
          token: 2,
          title: 'Use the wizard to create tables',
          message: "CREATE TABLE isn't run from the editor in this release.",
          hint: 'Creating a table from a topic?',
          hintAction: true,
        }}
        sqlRole="viewer"
      />
    );

    expect(screen.queryByRole('button', { name: 'Add a topic to SQL' })).toBeNull();
  });
});
