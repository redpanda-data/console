const webpackConfigPath = 'react-scripts/config/webpack.config';
const webpackConfig = require(webpackConfigPath);

const override = (config) => {
    if (config.mode != 'development') {
        config.devtool = 'nosources-source-map';
    } else {
        config.devtool = 'eval-source-map';
    }
  return config;
};

require.cache[require.resolve(webpackConfigPath)].exports = (env) => override(webpackConfig(env));

module.exports = require(webpackConfigPath);
