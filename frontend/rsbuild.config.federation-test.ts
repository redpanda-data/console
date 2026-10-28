// Copyright 2026 Redpanda Data, Inc.

import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { defineConfig, loadEnv } from '@rsbuild/core';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss';
import { pluginYaml } from '@rsbuild/plugin-yaml';

import { moduleFederationConfig, react19ModuleFederationConfig } from './module-federation.config';
import { sharedAliases } from './test.shared';

const { publicVars } = loadEnv({ prefixes: ['REACT_APP_'] });
const isReact19 = process.env.CONSOLE_FEDERATION_REACT19 === 'true';
const federationConfig = isReact19 ? react19ModuleFederationConfig : moduleFederationConfig;
const configuredExposes = federationConfig.exposes;

if (!configuredExposes || Array.isArray(configuredExposes)) {
  throw new Error('Federation contract tests require named Console exposes');
}

export default defineConfig({
  mode: 'development',
  environments: {
    node: {},
  },
  server: {
    cors: {
      origin: ['http://127.0.0.1'],
    },
  },
  source: {
    entry: {
      federationTest: {
        import: './tests/federation/remote-entry.ts',
        html: false,
      },
    },
    decorators: {
      version: 'legacy',
    },
    define: {
      ...publicVars,
    },
  },
  resolve: {
    // Spread, not shared: rspack normalises resolve.alias in place.
    alias: { ...sharedAliases },
  },
  output: {
    cleanDistPath: true,
    distPath: {
      root: isReact19 ? 'dist/federation-test-react19' : 'dist/federation-test',
    },
    emitCss: false,
    filenameHash: false,
    module: false,
    target: 'node',
  },
  performance: {
    printFileSize: false,
  },
  plugins: [
    pluginReact(),
    pluginSass(),
    pluginSvgr({ mixedImport: true }),
    pluginTailwindcss(),
    pluginYaml(),
    pluginModuleFederation(
      {
        ...federationConfig,
        filename: 'remoteEntry.cjs',
        library: {
          type: 'commonjs-module',
        },
        manifest: false,
        dts: false,
        dev: false,
        experiments: {
          ...federationConfig.experiments,
          asyncStartup: true,
        },
        exposes: configuredExposes,
      },
      { target: 'node' }
    ),
    pluginNodePolyfill({
      globals: { process: true },
    }),
  ],
});
