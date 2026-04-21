import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { defineConfig, loadEnv } from '@rsbuild/core';
import { pluginBabel } from '@rsbuild/plugin-babel';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { pluginYaml } from '@rsbuild/plugin-yaml';
import { RsdoctorRspackPlugin } from '@rsdoctor/rspack-plugin';
import { TanStackRouterRspack } from '@tanstack/router-plugin/rspack';
import MonacoWebpackPlugin from 'monaco-editor-webpack-plugin';

import { moduleFederationConfig } from './module-federation.config';
import { HEAP_APP_ID } from './src/heap/heap.helper';
import { HUBSPOT_PORTAL_ID } from './src/hubspot/hubspot.helper';

const { publicVars, rawPublicVars } = loadEnv({ prefixes: ['REACT_APP_'] });

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
            target: '18',
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
    proxy: [
      // AIGW v2 API - proxy to new AI Gateway management API (LLMProviderService, ModelService)
      ...(process.env.AIGW_URL
        ? [
            {
              context: ['/.aigw/api'],
              target: process.env.AIGW_URL,
              changeOrigin: true,
              secure: false,
              logLevel: 'debug',
              pathRewrite: { '^/\\.aigw/api': '' },
            },
          ]
        : []),
      // All other APIs - proxy to Console backend
      {
        context: ['/api', '/redpanda.api', '/auth', '/logout'],
        target: process.env.PROXY_TARGET || 'http://localhost:9090',
        changeOrigin: !!process.env.PROXY_TARGET,
        secure: process.env.PROXY_TARGET ? false : undefined,
      },
    ],
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
    buildCache: false,
  },
  output: {
    distPath: {
      root: 'build',
    },
  },
  tools: {
    rspack: (config, { appendPlugins }) => {
      config.lazyCompilation = false;
      config.experiments ||= {
        lazyBarrel: false,
      };
      config.resolve ||= {};
      config.resolve.alias ||= {};
      config.output ||= {};
      /* resolve symlinks so the proto generate code can be built. */
      config.resolve.symlinks = false;

      config.output.publicPath = 'auto';

      // Prevent rebuild loop by ignoring generated route tree file
      config.watchOptions = {
        ignored: ['**/routeTree.gen.ts'],
      };

      const plugins = [
        TanStackRouterRspack({
          target: 'react',
          autoCodeSplitting: true,
          routesDirectory: './src/routes',
          generatedRouteTree: './src/routeTree.gen.ts',
          quoteStyle: 'single',
          semicolons: true,
        }),
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
  },
});
