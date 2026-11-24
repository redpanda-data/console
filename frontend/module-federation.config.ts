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
import { version as reactVersion } from 'react/package.json';
import { version as reactDomVersion } from 'react-dom/package.json';

/**
 * Keep embedded.js and legacy entries for existing Cloud hosts. Both compatibility mounts use a private React 19 root even when the host uses React 18.
 */
export const moduleFederationConfig: ModuleFederationPluginOptions = {
  name: 'rp_console',
  filename: 'embedded.js',
  manifest: {
    fileName: 'mf-manifest.json',
  },

  exposes: {
    './App': './src/federation/console-legacy-app.tsx',
    './BridgeApp': './src/federation/console-federated-bridge.tsx',
    './types': './src/federation/types.ts',

    './EmbeddedApp': './src/embedded-app.tsx',
    './injectApp': './src/inject-app.tsx',
    './config': './src/config.ts',
  },

  shared: {},
};

export const REACT19_REQUIRED_VERSION = '^19.3.0';

const sharedReact19 = {
  import: false as const,
  singleton: true,
  strictVersion: true,
  requiredVersion: REACT19_REQUIRED_VERSION,
};

/** A separate container keeps the existing entries' private React untouched. */
export const react19ModuleFederationConfig: ModuleFederationPluginOptions = {
  name: 'rp_console_react19',
  filename: 'embedded.js',
  manifest: { fileName: 'mf-manifest.json' },
  exposes: {
    './ReactApp': './src/federation/console-app.tsx',
    './types': './src/federation/types.ts',
  },
  shared: {
    react: { ...sharedReact19, version: reactVersion },
    'react/jsx-runtime': { ...sharedReact19, version: reactVersion },
    'react/jsx-dev-runtime': { ...sharedReact19, version: reactVersion },
    'react-dom': { ...sharedReact19, version: reactDomVersion },
    'react-dom/client': { ...sharedReact19, version: reactDomVersion },
  },
};
