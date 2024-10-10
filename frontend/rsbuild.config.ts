import { defineConfig, loadEnv } from '@rsbuild/core';

import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { pluginSass } from '@rsbuild/plugin-sass';
import NodePolyfillPlugin from 'node-polyfill-webpack-plugin';
import { RsdoctorRspackPlugin } from '@rsdoctor/rspack-plugin';

import moduleFederationConfig from './module-federation';

const { publicVars } = loadEnv({ prefixes: ['REACT_APP_'] });

export default defineConfig({
    plugins: [
      pluginReact({
        reactRefreshOptions: {
          forceEnable: true,
        },
      }),
      pluginSvgr({ mixedImport: true }),
      pluginSass(),
    ],
    moduleFederation: {
      options: moduleFederationConfig,
    },
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
      },
    },
    server: {
      htmlFallback: 'index',
        proxy: {
          context: ['/api', '/redpanda.api'],
          target: 'http://localhost:9090',
       },
    },
    source: {
      define: publicVars,
      decorators: {
        version: 'legacy',
      }
    },
    output: {
      distPath: {
        root: 'build',
      },
    },
    tools: {
      rspack: (config, { appendPlugins }) => {
        config.optimization ||= {};
        config.resolve ||= {};
        config.resolve.alias ||= {};
        config.output ||= {};
        /* resolve symlinks so the proto generate code can be built. */
        config.resolve.symlinks = false;

        config.output.publicPath = 'auto';

        config.optimization.splitChunks = {
          chunks: 'all',
          minChunks: 1,
          minSize: 500 * 1024,
          maxSize: 1000 * 1024,
          maxAsyncRequests: 30,
          maxInitialRequests: 30,
          cacheGroups: {
            monaco: {
              chunks: 'all',
              test: /[\\/]node_modules[\\/]monaco-editor/,
              priority: 1000,
              name: 'monaco',
              reuseExistingChunk: true,
            },
          }
        }

        const plugins = [
          new NodePolyfillPlugin({
            additionalAliases: ['process'],
          }),
        ]

        if (process.env.RSDOCTOR) {
          plugins.push(new RsdoctorRspackPlugin({
            supports: {
              /**
               * @see https://rsdoctor.dev/config/options/options#generatetilegraph
               */
              generateTileGraph: true,
            }
          }));
        }

        appendPlugins(plugins);
      },
    },
  });
