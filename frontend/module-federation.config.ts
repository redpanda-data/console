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

import type { ModuleFederationOptions as ModuleFederationPluginOptions } from '@module-federation/rsbuild-plugin';

export const moduleFederationConfig: ModuleFederationPluginOptions = {
  name: 'rp_console',
  // IMPORTANT: Keep as 'embedded.js' for backward compatibility with existing Cloud UI
  filename: 'embedded.js',
  manifest: {
    fileName: 'mf-manifest.json',
  },

  exposes: {
    // React 18 hosts need the compatibility shim's private React 19 root.
    './App': './src/federation/console-legacy-app.tsx',
    // React bridge entry consumed by Cloud UI. Mounts the app with Console's own
    // React 19 createRoot into a host-provided DOM node, decoupling it from the
    // host's React 18. See src/federation/console-federated-bridge.tsx.
    './BridgeApp': './src/federation/console-federated-bridge.tsx',
    './types': './src/federation/types.ts',

    // Legacy: Keep for backward compat with old Cloud UI
    './EmbeddedApp': './src/embedded-app.tsx',
    './injectApp': './src/inject-app.tsx',
    './config': './src/config.ts',
  },

  // These compatibility entries must never consume the host's React singleton.
  shared: {},
};

const sharedReact19 = {
  singleton: true,
  strictVersion: true,
  requiredVersion: '^19.3.0',
};

// A separate container keeps the existing entries' private React untouched.
export const react19ModuleFederationConfig: ModuleFederationPluginOptions = {
  name: 'rp_console_react19',
  filename: 'embedded.js',
  manifest: { fileName: 'mf-manifest.json' },
  exposes: {
    './ReactApp': './src/federation/console-app.tsx',
    './types': './src/federation/types.ts',
  },
  shared: {
    react: sharedReact19,
    'react/jsx-runtime': sharedReact19,
    'react/jsx-dev-runtime': sharedReact19,
    'react-dom': sharedReact19,
    'react-dom/client': sharedReact19,
  },
};
