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


const { override, fixBabelImports, addBabelPreset, addBabelPresets, addBabelPlugin, addBabelPlugins, addDecoratorsLegacy } = require('customize-cra');


module.exports = override(
    addBabelPlugins(
        "@babel/plugin-proposal-nullish-coalescing-operator",
        "@babel/plugin-proposal-logical-assignment-operators"
    ),

    // fixBabelImports('import', {
    //     libraryName: 'antd',
    //     libraryDirectory: 'es',
    //     style: true,
    // }),

    // todo: to really get the dark theme working correctly we'll need
    // to fix a lot of stuff related to styling...
    // move inline styles out, invert stuff like #fff, ...
    // addLessLoader({
    //     javascriptEnabled: true,
    //     modifyVars: darkTheme.default
    // }),
);