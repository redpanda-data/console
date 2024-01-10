/**
 * Copyright 2023 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

/// <reference types="vite/client" />

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

import envCompatible from 'vite-plugin-env-compatible';
import checker from 'vite-plugin-checker';
import svgrPlugin from 'vite-plugin-svgr';
import { createHtmlPlugin } from 'vite-plugin-html';
import tsconfigPaths from 'vite-tsconfig-paths';
import muteWarningsPlugin, { warningsToIgnore } from './vite/muteWarningsPlugin';

import federation from '@originjs/vite-plugin-federation';

const ENV_PREFIX = 'REACT_APP_';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, 'env', ENV_PREFIX);

  return {
    base: './',
    plugins: [
      react({ // Needed to keep using MobX with legacy decorator patterns enabled
        babel: {
          parserOpts: {
            plugins: ['decorators-legacy', 'classProperties']
          }
        }
      }),
      federation({
        name: 'remote_app',
        filename: 'remoteEntry.js',
        exposes: {
          './EmbeddedApp': './src/EmbeddedApp',
        },
        shared: ['react', 'react-dom']
      }),
      envCompatible({ prefix: ENV_PREFIX }),
      checker({
        overlay: false,
        typescript: true,
      }),
      svgrPlugin({
        svgrOptions: {
          icon: true,
          // ...svgr options (https://react-svgr.com/docs/options/)
        },
      }),
      createHtmlPlugin({
        inject: {
          data: {
            env: {
              NODE_ENV: process.env.NODE_ENV,
              REACT_APP_ENABLED_FEATURES: process.env.REACT_APP_ENABLED_FEATURES,
              REACT_APP_BUSINESS: process.env.REACT_APP_BUSINESS,
              REACT_APP_CONSOLE_GIT_SHA: process.env.REACT_APP_CONSOLE_GIT_SHA,
              REACT_APP_CONSOLE_GIT_REF: process.env.REACT_APP_CONSOLE_GIT_REF,
              REACT_APP_BUILD_TIMESTAMP: process.env.REACT_APP_BUILD_TIMESTAMP,
              REACT_APP_DEV_HINT: process.env.REACT_APP_DEV_HINT,
              REACT_APP_OPEN_BROWSER: process.env.REACT_APP_OPEN_BROWSER,
            },
          },
        },
        minify: true,
      }),
      tsconfigPaths({
        ignoreConfigErrors: true,
      }),
      muteWarningsPlugin(warningsToIgnore),
    ],
    assetsInclude: ['**/*.md'],
    server: {
      port: 3004,
      open: env.REACT_APP_OPEN_BROWSER === 'true',
      watch: {
        usePolling: true,
      },
    },
    build: {
      outDir: 'build',
      sourcemap: true,
      modulePreload: {
        polyfill: false,
      },
      target: 'esnext',
      minify: false,
      cssCodeSplit: false,
       // TODO: we need to look at how Vite/Rollup sets source maps vs CRA.
      // Can we differentiate between production vs dev build?
    },
  };
});
