/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

const webpackConfigPath = 'react-scripts/config/webpack.config';
const webpackConfig = require(webpackConfigPath);

const { ModuleFederationPlugin } = require('webpack').container;
const HtmlWebpackPlugin = require('html-webpack-plugin');

const deps = require('../../package.json').dependencies;

const override = (config) => {
    if (config.mode != 'development') {
        config.devtool = 'nosources-source-map';
    } else {
        config.devtool = 'cheap-module-source-map';
    }


    config.output.publicPath = 'auto';
    config.plugins.push(new ModuleFederationPlugin(
        {
            filename: 'embedded.js',
            name: 'rp_console',

            exposes: {
                './EmbeddedApp': './src/EmbeddedApp',
            },

            shared: [
                {
                    react: {
                        singleton: true,
                        requiredVersion: deps.react
                    },
                    'react-dom': {
                        singleton: true,
                        requiredVersion: deps['react-dom']
                    },
                }
            ],
        }
    ));

    return config;
};

require.cache[require.resolve(webpackConfigPath)].exports = (env) => override(webpackConfig(env));

module.exports = require(webpackConfigPath);
