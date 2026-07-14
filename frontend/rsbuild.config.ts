import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { defineConfig, loadEnv } from '@rsbuild/core';
import { pluginBabel } from '@rsbuild/plugin-babel';
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
import path from 'node:path';

const { publicVars, rawPublicVars } = loadEnv({ prefixes: ['REACT_APP_'] });

// Matches the `?raw` import query (load files as raw source strings).
const RAW_QUERY = /raw/;

export default defineConfig({
  plugins: [
    pluginReact({
      reactRefreshOptions: {
        forceEnable: true,
      },
    }),
    pluginBabel({
      include: /\.(?:ts|tsx)$/,
      babelLoaderOptions(opts) {
        opts.plugins ??= [];
        opts.plugins.unshift([
          'babel-plugin-react-compiler',
          {
            target: '19',
            compilationMode: 'annotation',
            panicThreshold: 'critical_errors',
            // In annotation mode, this still gates which files CAN be opted in.
            // Files excluded here are ineligible even with 'use memo'.
            sources: (filename: string) => {
              if (filename.includes('/lib/redpanda-ui/')) {
                return false;
              }
              if (filename.includes('/gen/')) {
                return false;
              }
              if (filename.includes('node_modules')) {
                return false;
              }
              return true;
            },
          },
        ]);
      },
    }),
    pluginSvgr({ mixedImport: true }),
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
      // AIGW v2 API - proxy to new AI Gateway management API (LLMProviderService, ModelService)
      ...(process.env.AIGW_URL
        ? {
            '/.aigw/api': {
              target: process.env.AIGW_URL,
              changeOrigin: true,
              secure: false,
              logLevel: 'debug',
              pathRewrite: { '^/\\.aigw/api': '' },
            },
          }
        : {}),
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
    cacheGroups: {
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
    rspack: (config, { appendPlugins }) => {
      config.lazyCompilation = false;
      config.experiments = {
        ...config.experiments,
        lazyBarrel: false,
        nativeWatcher: true,
      };
      config.resolve ||= {};
      config.resolve.alias ||= {};
      config.output ||= {};
      /* resolve symlinks so the proto generate code can be built. */
      config.resolve.symlinks = false;

      // Stub `date-fns-tz` v2 imports from `@redpanda-data/ui` — see
      // `src/utils/vendor/date-fns-tz-shim.ts` for context.
      //
      // react-onclickoutside (transitive via `@redpanda-data/ui`'s react-datepicker)
      // statically imports `findDOMNode`, which React 19 removed — this breaks the
      // bundle's ESM linking. Console renders no datepicker, so redirect it to an
      // identity-HOC shim. See `src/shims/react-onclickoutside-shim.ts`.
      //
      // `@module-federation/bridge-react` auto-installs a webpack-plugin that aliases
      // `react-router-dom$` to its own router shim. Because Console declares no direct
      // react-router-dom dependency, that plugin falls back to its v6 shim (only
      // exports BrowserRouter/RouterProvider) and breaks `@redpanda-data/ui`, which
      // imports NavLink/Link from the real react-router-dom@7. Console does not federate
      // routing (it uses @tanstack/react-router), so point react-router-dom back at the
      // real package — the plugin spreads the user alias last, so this override wins.
      Object.assign(config.resolve.alias as Record<string, string>, {
        'date-fns-tz$': path.resolve(__dirname, 'src/utils/vendor/date-fns-tz-shim.ts'),
        'date-fns-tz/zonedTimeToUtc$': path.resolve(__dirname, 'src/utils/vendor/zonedTimeToUtc.ts'),
        'react-onclickoutside': path.resolve(__dirname, 'src/shims/react-onclickoutside-shim.ts'),
        'react-router-dom$': path.resolve(__dirname, 'node_modules/react-router-dom'),
      });

      config.output.publicPath = 'auto';

      // Prevent rebuild loop by ignoring generated route tree file
      config.watchOptions = {
        ignored: ['**/routeTree.gen.ts'],
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
