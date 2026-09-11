// Copyright 2026 Redpanda Data, Inc.

import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { defineConfig, loadEnv } from '@rsbuild/core';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss';
import { pluginYaml } from '@rsbuild/plugin-yaml';
import { RsdoctorRspackPlugin } from '@rsdoctor/rspack-plugin';
import { tanstackRouter } from '@tanstack/router-plugin/rspack';
import MonacoWebpackPlugin from 'monaco-editor-webpack-plugin';

import { moduleFederationConfig } from './module-federation.config';
import { HEAP_APP_ID } from './src/heap/heap.helper';
import { HUBSPOT_PORTAL_ID } from './src/hubspot/hubspot.helper';
import { TANSTACK_CHUNK_PATTERN, tanstackRouterConfig } from './tanstack-router.config';

const { publicVars, rawPublicVars } = loadEnv({ prefixes: ['REACT_APP_'] });

// Matches the `?raw` import query (load files as raw source strings).
const RAW_QUERY = /raw/;

export default defineConfig({
  plugins: [
    pluginReact({
      reactRefreshOptions: {
        forceEnable: true,
      },
      // Rspack's Rust implementation avoids the extra Babel transform while
      // preserving the existing opt-in React Compiler behavior.
      reactCompiler: {
        target: '19',
        compilationMode: 'annotation',
        panicThreshold: 'critical_errors',
      },
    }),
    pluginSvgr({ mixedImport: true, parallel: true }),
    pluginSass(),
    pluginTailwindcss(),
    pluginYaml(),
    pluginModuleFederation({
      ...moduleFederationConfig,
      dts: false,
    }),
    pluginNodePolyfill({
      globals: { process: true },
    }),
  ],
  dev: {
    hmr: true,
    lazyCompilation: false,
  },
  html: {
    template: './public/index.html',
    templateParameters: {
      REACT_APP_ENABLED_FEATURES: process.env.REACT_APP_ENABLED_FEATURES,
      REACT_APP_CONSOLE_GIT_SHA: process.env.REACT_APP_CONSOLE_GIT_SHA,
      REACT_APP_CONSOLE_PLATFORM_VERSION: process.env.REACT_APP_CONSOLE_PLATFORM_VERSION,
      REACT_APP_CONSOLE_GIT_REF: process.env.REACT_APP_CONSOLE_GIT_REF,
      REACT_APP_BUSINESS: process.env.REACT_APP_BUSINESS,
      REACT_APP_BUILD_TIMESTAMP: process.env.REACT_APP_BUILD_TIMESTAMP,
      REACT_APP_DEV_HINT: process.env.REACT_APP_DEV_HINT,
      HUBSPOT_PORTAL_ID,
      HEAP_APP_ID,
    },
  },
  server: {
    htmlFallback: 'index',
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:9090'],
      credentials: true,
    },
    proxy: {
      // All other APIs - proxy to Console backend
      '/api': {
        target: process.env.PROXY_TARGET || 'http://localhost:9090',
        changeOrigin: !!process.env.PROXY_TARGET,
        secure: process.env.PROXY_TARGET ? false : undefined,
      },
      '/redpanda.api': {
        target: process.env.PROXY_TARGET || 'http://localhost:9090',
        changeOrigin: !!process.env.PROXY_TARGET,
        secure: process.env.PROXY_TARGET ? false : undefined,
      },
      '/auth': {
        target: process.env.PROXY_TARGET || 'http://localhost:9090',
        changeOrigin: !!process.env.PROXY_TARGET,
        secure: process.env.PROXY_TARGET ? false : undefined,
      },
      '/logout': {
        target: process.env.PROXY_TARGET || 'http://localhost:9090',
        changeOrigin: !!process.env.PROXY_TARGET,
        secure: process.env.PROXY_TARGET ? false : undefined,
      },
    },
  },
  source: {
    define: {
      ...publicVars,
      'process.env': JSON.stringify(rawPublicVars),
    },
    decorators: {
      version: 'legacy',
    },
  },
  performance: {
    buildCache: process.env.NODE_ENV === 'development',
    // Drop debug logging from production bundles; keep console.error for
    // production diagnostics.
    removeConsole: ['log', 'warn'],
  },
  splitChunks: {
    preset: 'default',
    chunks: 'all',
    // A 4 MiB cap cut the largest async chunk from 10.06 MB to 5.65 MB
    // while adding 13 requests; 512 KiB added 127 with no further reduction.
    maxAsyncSize: 4 * 1024 * 1024,
    cacheGroups: {
      monaco: {
        test: /[\\/]node_modules[\\/]monaco-editor[\\/]/,
        name: 'lib-monaco-editor',
        priority: 30,
        enforce: true,
        reuseExistingChunk: true,
      },
      tanstack: {
        test: TANSTACK_CHUNK_PATTERN,
        name: 'lib-tanstack',
        chunks: 'all',
        priority: 10,
        reuseExistingChunk: true,
      },
    },
  },
  output: {
    distPath: {
      root: 'build',
    },
  },
  tools: {
    rspack: (config, { appendPlugins, isProd }) => {
      config.lazyCompilation = false;
      config.experiments = {
        ...config.experiments,
        asyncWebAssembly: true,
        futureDefaults: true,
        nativeWatcher: true,
        pureFunctions: isProd,
      };
      config.resolve ||= {};
      config.output ||= {};
      /* resolve symlinks so the proto generate code can be built. */
      config.resolve.symlinks = false;

      config.output.publicPath = 'auto';

      // Prevent rebuild loop by ignoring generated route tree file and Playwright MCP's
      // scratch output (screenshots/console logs it writes into the project root while
      // driving the dev server) — rspack's incremental build panics on rapid rebuilds
      // triggered by files that never touch the actual module graph.
      config.watchOptions = {
        ignored: ['**/routeTree.gen.ts', '**/.playwright-mcp/**'],
      };

      const plugins = [
        tanstackRouter(tanstackRouterConfig),
        new MonacoWebpackPlugin({
          languages: ['yaml', 'json', 'typescript', 'javascript', 'protobuf'],
          customLanguages: [
            {
              label: 'yaml',
              entry: 'monaco-yaml',
              worker: {
                id: 'monaco-yaml/yamlWorker',
                entry: 'monaco-yaml/yaml.worker',
              },
            },
          ],
          filename: 'static/js/[name].worker.js',
        }),
      ];

      if (process.env.RSDOCTOR) {
        plugins.push(
          new RsdoctorRspackPlugin({
            disableClientServer: true,
            output: {
              mode: 'brief',
              options: {
                type: ['json'],
              },
            },
          })
        );
      }
      appendPlugins(plugins);
    },
    bundlerChain: (chain) => {
      // pluginYaml parses `.yaml` into a JS object; exclude `?raw` imports and load
      // them as source strings so templates keep comments and ${...} tokens verbatim.
      if (chain.module.rules.has('yaml')) {
        chain.module.rule('yaml').resourceQuery({ not: [RAW_QUERY] });
      }
      chain.module.rule('raw-source').resourceQuery(RAW_QUERY).type('asset/source');
    },
  },
});
