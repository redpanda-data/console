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

import { useLocation, useMatches, useNavigate, useRouter } from '@tanstack/react-router';
import {
  type unstable_AdapterInterface as AdapterInterface,
  type unstable_AdapterOptions as AdapterOptions,
  unstable_createAdapterProvider as createAdapterProvider,
  renderQueryString,
} from 'nuqs/adapters/custom';
import { startTransition, useCallback, useMemo } from 'react';

/**
 * Drop-in replacement for `NuqsAdapter` from 'nuqs/adapters/tanstack-router' that drops
 * stale URL updates.
 *
 * nuqs queues URL updates and flushes them inside `startTransition(() => navigate({ to, from }))`.
 * That transition is low-priority: frequent synchronous re-renders (e.g. message-search progress
 * updates) can keep preempting it, and a user navigation commits first. The deferred flush then
 * runs `navigate` with a `from` route that is no longer matched, so its path params are
 * unresolvable and TanStack Router interpolates them as the literal string "undefined"
 * (e.g. /topics/$topicName -> /topics/undefined). We drop such updates instead: the component
 * that requested them is gone, so the update is meaningless.
 */
function useNuqsTanstackRouterAdapter(watchKeys: string[]): AdapterInterface {
  const search = useLocation({
    select: (state) => Object.fromEntries(Object.entries(state.search).filter(([key]) => watchKeys.includes(key))),
  });
  const navigate = useNavigate();
  const router = useRouter();
  const from = useMatches({
    select: (matches) => (matches.length > 0 ? matches.at(-1)?.fullPath : undefined),
  });

  const watchKeysStr = watchKeys.join(',');
  const searchParams = useMemo(
    () =>
      new URLSearchParams(
        Object.entries(search).flatMap(([key, value]): [string, string][] => {
          if (Array.isArray(value)) {
            return value.map((v) => [key, String(v)]);
          }
          if (typeof value === 'object' && value !== null) {
            return [[key, JSON.stringify(value)]];
          }
          return [[key, String(value)]];
        })
      ),
    // watchKeysStr mirrors the upstream nuqs adapter's dependency on the watched keys.
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional, mirrors upstream
    [search, watchKeysStr]
  );

  const updateUrl = useCallback(
    (newSearch: URLSearchParams, options: Required<AdapterOptions>) => {
      startTransition(() => {
        // Checked at flush time, not render time: the router may have navigated away (or
        // have a navigation in flight) between this update being queued and the transition
        // running. While a navigation is pending, `state.matches` still holds the previous
        // route, so the pending matches are the ones `from` must be resolved against.
        const pendingMatches = router.stores.pendingMatches.get();
        const activeMatches = pendingMatches.length > 0 ? pendingMatches : router.state.matches;
        if (from && !activeMatches.some((m) => m.fullPath === from)) {
          return;
        }
        navigate({
          to: renderQueryString(newSearch) || '.',
          ...(from ? { from } : {}),
          replace: options.history === 'replace',
          resetScroll: options.scroll,
          hash: (prevHash?: string) => prevHash ?? '',
        });
      });
    },
    [navigate, from, router]
  );

  return {
    searchParams,
    updateUrl,
    rateLimitFactor: 1,
  };
}

export const NuqsAdapter = createAdapterProvider(useNuqsTanstackRouterAdapter);
