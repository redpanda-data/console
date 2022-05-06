
const { override, addBabelPlugins } = require('customize-cra');


module.exports = override(
    addBabelPlugins(
        "@babel/plugin-proposal-nullish-coalescing-operator",
        "@babel/plugin-proposal-logical-assignment-operators"
    ),

    (webpackConfig) => {
        if (webpackConfig.mode != 'development') {
            webpackConfig.devtool = 'nosources-source-map';
        }
        return webpackConfig;
    },
);