const deps = require('./package.json').dependencies;
module.exports = {
    filename: 'embedded.js',
    name: 'rp_console',

    exposes: {
        './EmbeddedApp': './src/EmbeddedApp',
        './injectApp': './src/injectApp',
        './config': './src/config.ts',
    },

    shared: [
        {
            react: {
                singleton: true,
                requiredVersion: deps.react,
            },
            'react-dom': {
                singleton: true,
                requiredVersion: deps['react-dom'],
            }
        }
    ],
};
