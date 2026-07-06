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

import { createFileRoute, Outlet, redirect, useNavigate } from '@tanstack/react-router';
import { Database } from 'lucide-react';
import { useEffect } from 'react';
import { Feature, isSupported, useSupportedFeaturesStore } from 'state/supported-features';
import { uiState } from 'state/ui-state';

// Layout for the SQL section's two views: the landing/overview at /sql and the
// query editor studio at /sql/editor. Each view is a real route, so the editor
// is deep-linkable, the back button returns editor → landing, and entry intent
// (seed query, auto-run, wizard) travels in the URL instead of component state.

// The registry's near-black dark theme renders borders at rgba(255,255,255,0.04)
// — effectively invisible. The SQL surfaces use visible grey dividers, so re-point
// the border tokens to the registry grey scale in dark mode only (light untouched).
// Defined once here; both views inherit the custom properties from this wrapper.
const SQL_DARK_BORDERS =
  'dark:[--color-border-strong:var(--color-grey-800)] dark:[--color-border-subtle:var(--color-grey-600)] dark:[--color-border:var(--color-grey-700)]';

// allow: error-boundary [pure redirect in beforeLoad, no data fetching]
export const Route = createFileRoute('/sql')({
  staticData: {
    title: 'SQL',
    icon: Database,
    fullscreen: true,
  },
  // Gate direct navigation to /sql on the same capability check as the sidebar.
  // isSupported() returns false both when SQLService is unsupported and when the
  // endpoint list hasn't loaded yet, so redirecting on the latter bounces a cold
  // load off /sql before the answer is known. Only redirect once it's loaded.
  beforeLoad: () => {
    const { endpointCompatibility } = useSupportedFeaturesStore.getState();
    if (endpointCompatibility !== null && !isSupported(Feature.SQLService)) {
      throw redirect({ to: '/', replace: true });
    }
  },
  component: SqlLayout,
});

function SqlLayout() {
  const navigate = useNavigate();
  // beforeLoad skips the redirect while endpoint compatibility is still
  // loading; once it resolves, bounce clusters that genuinely lack SQLService.
  // Lives on the layout so it covers both the landing and the editor.
  const endpointsLoaded = useSupportedFeaturesStore((s) => s.endpointCompatibility !== null);
  useEffect(() => {
    if (endpointsLoaded && !isSupported(Feature.SQLService)) {
      navigate({ to: '/', replace: true });
    }
  }, [endpointsLoaded, navigate]);

  // Standalone console renders its own breadcrumb/title header for the SQL
  // section; populate it the way other pages do (no-op visually when embedded).
  useEffect(() => {
    uiState.pageTitle = 'SQL';
    uiState.pageBreadcrumbs = [{ title: 'SQL', linkTo: '/sql', heading: 'SQL' }];
  }, []);

  return (
    <div className={`flex h-full flex-col bg-background text-strong ${SQL_DARK_BORDERS}`}>
      <Outlet />
    </div>
  );
}
