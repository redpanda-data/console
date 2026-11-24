// Copyright 2026 Redpanda Data, Inc.

import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { defineConfig, loadEnv, type RsbuildConfig } from '@rsbuild/core';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss';
import { pluginYaml } from '@rsbuild/plugin-yaml';
import { RsdoctorRspackPlugin } from '@rsdoctor/core';
import { tanstackRouter } from '@tanstack/router-plugin/rspack';

import { moduleFederationConfig } from './module-federation.config';
import { HEAP_APP_ID } from './src/heap/heap-tracking';
import { HUBSPOT_PORTAL_ID } from './src/hubspot/hubspot-tracking';
import { TANSTACK_CHUNK_PATTERN, tanstackRouterConfig } from './tanstack-router.config';
import { fileURLToPath } from 'node:url';

const { publicVars, rawPublicVars } = loadEnv({ prefixes: ['REACT_APP_'] });

const RAW_QUERY = /raw/u;

/**
 * Use Rspack's React Compiler transform with annotation mode so source opt-in stays unchanged.
 */
export const consolePlugins = (federationConfig = moduleFederationConfig) => [
  pluginReact({
    reactRefreshOptions: {
      forceEnable: true,
    },
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
    ...federationConfig,
    dts: false,
  }),
  pluginNodePolyfill({
    globals: { process: true },
  }),
];

export default defineConfig({
  plugins: consolePlugins(),
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
    removeConsole: ['log', 'warn'],
  },
  splitChunks: {
    preset: 'default',
    chunks: 'all',
    maxAsyncSize: 4 * 1024 * 1024,
    cacheGroups: {
      // WARNING: Keep Monaco language services and worker tokenizers out of the core editor chunk so they still load on demand.
      monaco: {
        test: /[\\/]node_modules[\\/]monaco-editor[\\/](?!esm[\\/]vs[\\/](?:language|basic-languages)[\\/])/u,
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
  tools: consoleTools(),
});

/**
 * The async chunk cap bounds the largest request without splitting the editor's lazy language services into the core bundle.
 */
export function consoleTools({ federationOnly = false } = {}): NonNullable<RsbuildConfig['tools']> {
  return {
    htmlPlugin: federationOnly ? false : undefined,
    rspack: (config, { appendPlugins, isProd }) => {
      config.lazyCompilation = false;
      if (federationOnly) {
        config.entry = {};
      }
      config.experiments = {
        ...config.experiments,
        asyncWebAssembly: true,
        futureDefaults: true,
        nativeWatcher: true,
        pureFunctions: isProd,
      };
      config.resolve ||= {};
      config.output ||= {};
      config.resolve.symlinks = false;

      config.output.publicPath = 'auto';

      // WARNING: Ignore generated routes and dev-tool scratch files; their writes can otherwise retrigger the incremental build.
      config.watchOptions = {
        ignored: ['**/routeTree.gen.ts', '**/.playwright-mcp/**'],
      };

      appendPlugins(createConsolePlugins(federationOnly));
    },
    bundlerChain: (chain) => {
      // WARNING: Exclude raw YAML from the parser so templates keep comments and interpolation tokens verbatim.
      if (chain.module.rules.has('yaml')) {
        chain.module.rule('yaml').resourceQuery({ not: [RAW_QUERY] });
      }
      chain.module.rule('raw-source').resourceQuery(RAW_QUERY).type('asset/source');
    },
  };
}

function createConsolePlugins(federationOnly: boolean) {
  const plugins = federationOnly ? [] : [tanstackRouter(tanstackRouterConfig)];

  if (process.env.RSDOCTOR) {
    plugins.push(
      new RsdoctorRspackPlugin({
        disableClientServer: true,
        supports: {
          brotli: true,
        },
        output: {
          mode: 'brief',
          reportDir: fileURLToPath(
            new URL(federationOnly ? './build-stats/rsdoctor-react19' : './build-stats/rsdoctor', import.meta.url)
          ),
          options: {
            type: ['html', 'json'],
          },
        },
      })
    );
  }
  return plugins;
}
