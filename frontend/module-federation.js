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
      requiredVersion: '>=18.0.0 <20.0.0',
    },
    'react-dom': {
      singleton: true,
      requiredVersion: '>=18.0.0 <20.0.0',
    },
  },
};
