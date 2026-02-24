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

const deps: Record<string, string> = (await import('./package.json', { with: { type: 'json' } })).default.dependencies;

export const moduleFederationConfig: ModuleFederationPluginOptions = {
  name: 'rp_console',
  // IMPORTANT: Keep as 'embedded.js' for backward compatibility with existing Cloud UI
  filename: 'embedded.js',
  manifest: {
    fileName: 'mf-manifest.json',
  },

  exposes: {
    // V2: New component pattern for Cloud UI MF v2.0 integration
    './App': './src/federation/console-app.tsx',
    './types': './src/federation/types.ts',

    // Legacy: Keep for backward compat with old Cloud UI
    './EmbeddedApp': './src/embedded-app.tsx',
    './injectApp': './src/inject-app.tsx',
    './connect-tiles': './src/components/pages/rp-connect/onboarding/connect-tiles.tsx',
    './config': './src/config.ts',
  },

  shared: {
    react: {
      singleton: true,
      requiredVersion: deps.react,
      eager: false,
    },
    'react-dom': {
      singleton: true,
      requiredVersion: deps['react-dom'],
      eager: false,
    },
    '@redpanda-data/ui': {
      import: '@redpanda-data/ui',
    },
    '@tanstack/react-query': {
      singleton: true,
      requiredVersion: deps['@tanstack/react-query'],
      eager: false,
    },
    '@tanstack/react-router': {
      singleton: true,
      requiredVersion: deps['@tanstack/react-router'],
      eager: false,
    },
    'react-hook-form': {
      singleton: true,
      requiredVersion: deps['react-hook-form'],
    },
    '@hookform/resolvers': {
      singleton: true,
      requiredVersion: deps['@hookform/resolvers'],
    },
    zod: {
      singleton: true,
      requiredVersion: deps.zod,
    },
    'lucide-react': {
      singleton: true,
      requiredVersion: deps['lucide-react'],
      eager: false,
    },
    'class-variance-authority': {
      singleton: false,
      requiredVersion: deps['class-variance-authority'],
    },
    'tailwind-merge': {
      singleton: false,
      requiredVersion: deps['tailwind-merge'],
    },
    motion: {
      singleton: false,
      requiredVersion: deps.motion,
    },
    clsx: {
      singleton: false,
      requiredVersion: deps.clsx,
    },
  },
};
