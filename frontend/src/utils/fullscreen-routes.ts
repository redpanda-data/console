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

import { routeTree } from '../routeTree.gen';

/**
 * Fullscreen routes (e.g. the SQL studio) render minimal chrome. The layout
 * components detect them from `staticData.fullscreen` on the resolved route
 * matches — but on soft navigation `useLocation().pathname` flips to the new
 * route synchronously while `useMatches()` still holds the *previous* route's
 * matches until the new match resolves. During that window staticData reports
 * `fullscreen: false`, so the studio would flash full chrome (header row + top
 * padding) on every in-app navigation into it.
 *
 * This path-based check bridges that gap. The fullscreen paths are derived from
 * the route tree (single source of truth: `staticData.fullscreen` in the route
 * definition) rather than hardcoded, so any future fullscreen route is covered
 * automatically.
 */

type StaticData = { fullscreen?: boolean };

/**
 * The slice of a TanStack route node this module reads. A built route exposes
 * `path`/`staticData` under `options`; a raw route definition exposes them at
 * the top level — we tolerate both. `children` is keyed by generated route name.
 */
interface FullscreenRouteNode {
  path?: string;
  staticData?: StaticData;
  options?: { path?: string; staticData?: StaticData };
  children?: { [routeName: string]: FullscreenRouteNode };
}

const isRouteNode = (value: unknown): value is FullscreenRouteNode => typeof value === 'object' && value !== null;

/** Walk the route tree and collect the paths of routes marked `staticData.fullscreen`. */
export function collectFullscreenPaths(node: unknown): string[] {
  const paths: string[] = [];
  const visit = (value: unknown) => {
    if (!isRouteNode(value)) {
      return;
    }
    const path = value.options?.path ?? value.path;
    const fullscreen = value.options?.staticData?.fullscreen ?? value.staticData?.fullscreen;
    if (path && fullscreen) {
      paths.push(path);
    }
    if (value.children) {
      for (const child of Object.values(value.children)) {
        visit(child);
      }
    }
  };
  visit(node);
  return paths;
}

/**
 * True when `pathname` is (or is nested under) one of `paths`. Matches the path
 * as a `/`-bounded segment so it tolerates host prefixes when embedded — e.g.
 * Cloud UI's `/clusters/<id>/sql` — while not matching `/mysql` or `/sqlx`.
 */
export function matchesFullscreenPath(pathname: string, paths: string[]): boolean {
  return paths.some((path) => {
    const index = pathname.indexOf(path);
    if (index === -1) {
      return false;
    }
    const charAfter = pathname.charAt(index + path.length);
    return charAfter === '' || charAfter === '/';
  });
}

// Computed lazily, not at module load: `__root.tsx` imports this module and is
// itself imported by `routeTree.gen`, so reading `routeTree` at module-eval time
// races the circular import and sees it undefined. By first call (render time)
// the tree is fully built. The result is stable, so memoize it.
let cachedFullscreenPaths: string[] | null = null;

/** Whether the given pathname belongs to a fullscreen route. See module docs. */
export const isFullscreenPath = (pathname: string): boolean => {
  if (cachedFullscreenPaths === null) {
    cachedFullscreenPaths = collectFullscreenPaths(routeTree);
  }
  return matchesFullscreenPath(pathname, cachedFullscreenPaths);
};
