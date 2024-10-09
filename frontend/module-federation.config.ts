import type { Rspack } from '@rsbuild/core';
import { dependencies } from './package.json';

export const moduleFederationConfig: Rspack.ModuleFederationPluginOptions = {
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
    dts: false,
};
