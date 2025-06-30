const deps = require('./package.json').dependencies;

module.exports = {
  filename: 'embedded.js',
  name: 'rp_console',

  exposes: {
    './EmbeddedApp': './src/EmbeddedApp.tsx',
    './injectApp': './src/injectApp.tsx',
    './config': './src/config.ts',
  },

  shared: {
    react: {
      singleton: true,
    },
    'react-dom': {
      singleton: true,
    },
    '@redpanda-data/ui': {
      singleton: true,
      requiredVersion: deps['@redpanda-data/ui'],
    },
  },
};
