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

import type { ModuleFederationPluginOptions } from '@module-federation/rsbuild-plugin';

export const moduleFederationConfig: ModuleFederationPluginOptions = {
  name: 'rp_console',
  // IMPORTANT: Keep as 'embedded.js' for backward compatibility with existing Cloud UI
  filename: 'embedded.js',
  manifest: {
    fileName: 'mf-manifest.json',
  },

  exposes: {
    // './App' is a React 18-safe compatibility shim. Console runs React 19, but
    // the current Cloud UI host (React 18) still loads 'rp_console/App' and
    // renders it as a plain element. The shim returns a React 18 element shape
    // whose ref mounts the real React 19 app via Console's own createRoot, so
    // the existing host keeps working with no Cloud UI change. New Cloud UI
    // hosts consume './BridgeApp' instead.
    './App': './src/federation/console-legacy-app.tsx',
    // React bridge entry consumed by Cloud UI. Mounts the app with Console's own
    // React 19 createRoot into a host-provided DOM node, decoupling it from the
    // host's React 18. See src/federation/console-federated-bridge.tsx.
    './BridgeApp': './src/federation/console-federated-bridge.tsx',
    './types': './src/federation/types.ts',

    // Legacy: Keep for backward compat with old Cloud UI
    './EmbeddedApp': './src/embedded-app.tsx',
    './injectApp': './src/inject-app.tsx',
    './connect-tiles': './src/components/pages/rp-connect/onboarding/connect-tiles.tsx',
    './config': './src/config.ts',
  },

  // Nothing is shared. Console runs React 19 while Cloud UI stays on React 18; a
  // shared React singleton cannot span both majors. The React bridge
  // ('./BridgeApp') isolates Console's React 19 along with its own
  // @tanstack/react-query, @tanstack/react-router, react-hook-form and the rest,
  // so each app bundles its own copies and no cross-major React conflict can
  // occur in the embedded scene. (lucide-react was never shared either —
  // stateless SVGs with no singleton requirement.)
  shared: {},
};
