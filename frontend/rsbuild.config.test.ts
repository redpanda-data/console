/**
 * Rsbuild config for RSTest - excludes Module Federation to avoid serialization issues
 */
import { defineConfig, loadEnv } from '@rsbuild/core';
import path from 'node:path';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { pluginYaml } from '@rsbuild/plugin-yaml';
import { TanStackRouterRspack } from '@tanstack/router-plugin/rspack';
import NodePolyfillPlugin from 'node-polyfill-webpack-plugin';

const { publicVars, rawPublicVars } = loadEnv({ prefixes: ['REACT_APP_'] });

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginSvgr({ mixedImport: true }),
    pluginSass(),
    pluginYaml(),
    // Note: Module Federation is excluded intentionally for tests
  ],
  source: {
    define: {
      ...publicVars,
      'process.env': JSON.stringify(rawPublicVars),
    },
    decorators: {
      version: 'legacy',
    },
    // Path alias to match tsconfig paths: { "*": ["./src/*"] }
    tsconfigPath: path.resolve(__dirname, 'tsconfig.base.json'),
  },
  tools: {
    rspack: (config, { appendPlugins }) => {
      config.resolve ||= {};
      config.resolve.symlinks = false;
      config.resolve.alias ||= {};
      // Monaco-editor alias to match vitest config
      config.resolve.alias['monaco-editor'] = 'monaco-editor/esm/vs/editor/editor.api.js';

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
        new NodePolyfillPlugin({
          additionalAliases: ['process'],
        }),
        // MonacoWebpackPlugin excluded for tests
      ];

      appendPlugins(plugins);

      // Disable splitChunks to avoid chunk naming issues in RSTest
      config.optimization ||= {};
      config.optimization.splitChunks = false;
    },
  },
});
