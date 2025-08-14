import { defineConfig, loadEnv } from '@rsbuild/core';

import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { pluginYaml } from '@rsbuild/plugin-yaml';
import { RsdoctorRspackPlugin } from '@rsdoctor/rspack-plugin';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import MonacoWebpackPlugin from 'monaco-editor-webpack-plugin';
import NodePolyfillPlugin from 'node-polyfill-webpack-plugin';

import moduleFederationConfig from "./module-federation";
import { HUBSPOT_PORTAL_ID } from './src/components/pages/agents/hubspot.helper';
import { HEAP_APP_ID } from './src/components/pages/agents/heap.helper';

const { publicVars, rawPublicVars } = loadEnv({ prefixes: ["REACT_APP_"] });

export default defineConfig({
  plugins: [
    pluginReact({
      reactRefreshOptions: {
        forceEnable: true,
      },
    }),
    pluginSvgr({ mixedImport: true }),
    pluginSass(),
    pluginYaml(),
    pluginModuleFederation({
      ...moduleFederationConfig,
      dts: false, // Disable DTS generation to avoid type resolution issues
    }),
  ],
  dev: {
    hmr: true,
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
      HUBSPOT_PORTAL_ID: HUBSPOT_PORTAL_ID,
      HEAP_APP_ID: HEAP_APP_ID,
    },
  },
  server: {
    htmlFallback: 'index',
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:9090'],
      credentials: true,
    },
    proxy: {
      context: ['/api', '/redpanda.api', '/auth', '/logout'],
      target: 'http://localhost:9090',
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
  output: {
    distPath: {
      root: 'build',
    },
  },
  tools: {
    rspack: (config, { appendPlugins }) => {
      config.resolve ||= {};
      config.resolve.alias ||= {};
      config.output ||= {};
      /* resolve symlinks so the proto generate code can be built. */
      config.resolve.symlinks = false;

      config.output.publicPath = 'auto';

      const plugins = [
        new NodePolyfillPlugin({
          additionalAliases: ['process'],
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
            supports: {
              /**
               * @see https://rsdoctor.dev/config/options/options#generatetilegraph
               */
              generateTileGraph: true,
            },
          }),
        );
      }

      appendPlugins(plugins);
    },
  },
});
