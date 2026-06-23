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

import { describe, expect, test } from 'vitest';

import { collectFullscreenPaths, isFullscreenPath, matchesFullscreenPath } from './fullscreen-routes';
import { routeTree } from '../routeTree.gen';

describe('collectFullscreenPaths', () => {
  test('collects paths from built route nodes (path/staticData under options)', () => {
    const tree = {
      children: {
        SqlRoute: { options: { path: '/sql', staticData: { fullscreen: true } } },
        TopicsRoute: { options: { path: '/topics', staticData: { fullscreen: false } } },
        QuotasRoute: { options: { path: '/quotas' } },
      },
    };
    expect(collectFullscreenPaths(tree)).toEqual(['/sql']);
  });

  test('collects paths from raw route nodes (path/staticData at top level)', () => {
    const tree = {
      children: {
        SqlRoute: { path: '/sql', staticData: { fullscreen: true } },
      },
    };
    expect(collectFullscreenPaths(tree)).toEqual(['/sql']);
  });

  test('recurses into nested children', () => {
    const tree = {
      children: {
        Parent: {
          options: { path: '/parent' },
          children: {
            Child: { options: { path: '/parent/studio', staticData: { fullscreen: true } } },
          },
        },
      },
    };
    expect(collectFullscreenPaths(tree)).toEqual(['/parent/studio']);
  });

  test('ignores a fullscreen route with no path', () => {
    const tree = { children: { Bad: { options: { staticData: { fullscreen: true } } } } };
    expect(collectFullscreenPaths(tree)).toEqual([]);
  });

  test('tolerates non-object input', () => {
    expect(collectFullscreenPaths(null)).toEqual([]);
    expect(collectFullscreenPaths(undefined)).toEqual([]);
  });

  test('derives /sql from the real route tree', () => {
    // Guards against route-tree shape changes and against the SQL route losing
    // its staticData.fullscreen flag.
    expect(collectFullscreenPaths(routeTree)).toContain('/sql');
  });
});

describe('matchesFullscreenPath', () => {
  const paths = ['/sql'];

  test('matches the exact path', () => {
    expect(matchesFullscreenPath('/sql', paths)).toBe(true);
  });

  test('matches a nested path', () => {
    expect(matchesFullscreenPath('/sql/query/123', paths)).toBe(true);
  });

  test('matches an embedded path with a host cluster prefix', () => {
    expect(matchesFullscreenPath('/clusters/abc123/sql', paths)).toBe(true);
  });

  test('does not match a path that merely starts with the segment text', () => {
    expect(matchesFullscreenPath('/sqlx', paths)).toBe(false);
    expect(matchesFullscreenPath('/mysql', paths)).toBe(false);
  });

  test('does not match an interior segment that merely happens to be named sql', () => {
    expect(matchesFullscreenPath('/clusters/sql/overview', paths)).toBe(false);
  });

  test('does not match unrelated paths', () => {
    expect(matchesFullscreenPath('/topics', paths)).toBe(false);
  });

  test('returns false when there are no fullscreen paths', () => {
    expect(matchesFullscreenPath('/sql', [])).toBe(false);
  });
});

describe('isFullscreenPath (wired to the real route tree)', () => {
  test('recognizes the SQL studio, standalone and embedded', () => {
    expect(isFullscreenPath('/sql')).toBe(true);
    expect(isFullscreenPath('/clusters/abc123/sql')).toBe(true);
  });

  test('rejects non-fullscreen routes', () => {
    expect(isFullscreenPath('/topics')).toBe(false);
    expect(isFullscreenPath('/overview')).toBe(false);
  });
});
