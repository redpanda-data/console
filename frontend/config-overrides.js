
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