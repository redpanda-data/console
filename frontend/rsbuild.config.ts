import { defineConfig, loadEnv } from '@rsbuild/core';

import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { pluginSass } from '@rsbuild/plugin-sass';
import NodePolyfillPlugin from 'node-polyfill-webpack-plugin';
import MonacoWebpackPlugin from 'monaco-editor-webpack-plugin'
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
        config.resolve ||= {};
        config.resolve.alias ||= {};
        config.output ||= {};
        /* resolve symlinks so the proto generate code can be built. */
        config.resolve.symlinks = false;

        const plugins = [
          new NodePolyfillPlugin({
            additionalAliases: ['process'],
          }),
          new MonacoWebpackPlugin({
            languages: ['json', 'css', 'scss', 'less', 'html', 'handlebars', 'razor', 'typescript', 'javascript', 'yaml'],
            customLanguages: [
              {
                label: 'yaml',
                entry: 'monaco-yaml',
                worker: {
                  id: 'monaco-yaml/yamlWorker',
                  entry: 'monaco-yaml/yaml.worker'
                }
              }
            ]
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
