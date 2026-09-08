// Copyright 2026 Redpanda Data, Inc.

import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { defineConfig, loadEnv } from '@rsbuild/core';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss';
import { pluginYaml } from '@rsbuild/plugin-yaml';

import { moduleFederationConfig } from './module-federation.config';
import { sharedAliases } from './test.shared';
import { resolve } from 'node:path';

const { publicVars } = loadEnv({ prefixes: ['REACT_APP_'] });
const configuredExposes = moduleFederationConfig.exposes;

if (!configuredExposes || Array.isArray(configuredExposes)) {
  throw new Error('Federation contract tests require named Console exposes');
}

const configExpose = configuredExposes['./config'];

if (!configExpose) {
  throw new Error('Federation contract tests require the config expose');
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
    alias: {
      ...sharedAliases,
      'react-onclickoutside': resolve(import.meta.dirname, 'src/shims/react-onclickoutside-shim.ts'),
      'react-router-dom$': resolve(import.meta.dirname, 'node_modules/react-router-dom'),
    },
  },
  output: {
    cleanDistPath: true,
    distPath: {
      root: 'dist/federation-test',
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
        ...moduleFederationConfig,
        name: 'rp_console',
        filename: 'remoteEntry.cjs',
        library: {
          type: 'commonjs-module',
        },
        manifest: false,
        dts: false,
        dev: false,
        experiments: {
          ...moduleFederationConfig.experiments,
          asyncStartup: true,
        },
        exposes: {
          './config': configExpose,
        },
      },
      { target: 'node' }
    ),
    pluginNodePolyfill({
      globals: { process: true },
    }),
  ],
});
