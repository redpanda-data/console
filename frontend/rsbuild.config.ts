import { defineConfig, loadEnv } from '@rsbuild/core';

import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { pluginSass } from '@rsbuild/plugin-sass';
import NodePolyfillPlugin from 'node-polyfill-webpack-plugin';
import MonacoWebpackPlugin from 'monaco-editor-webpack-plugin'
import { RsdoctorRspackPlugin } from '@rsdoctor/rspack-plugin';
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';

import { dependencies } from './package.json';

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
    dev: {
      hmr: true,
    },
    html: {
      template: './public/index.html'
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
          new ModuleFederationPlugin({
            filename: 'embedded.js',
            name: 'rp_console',
            exposes: {
                './EmbeddedApp': './src/EmbeddedApp',
                './injectApp': './src/injectApp',
                './config': './src/config.ts',
            },
            shared: {
                react: {
                    singleton: true,
                    requiredVersion: dependencies.react,
                },
                'react-dom': {
                    singleton: true,
                    requiredVersion: dependencies['react-dom'],
                },
                'react-router-dom': {
                    singleton: true,
                    requiredVersion: dependencies['react-router-dom'],
                },
                '@redpanda-data/ui': {
                    singleton: true,
                    requiredVersion: dependencies['@redpanda-data/ui'],
                },
            },
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
