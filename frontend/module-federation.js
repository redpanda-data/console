const deps = require('./package.json').dependencies;

module.exports = {
  filename: 'embedded.js',
  name: 'rp_console',

  exposes: {
    './EmbeddedApp': './src/EmbeddedApp.tsx',
    './injectApp': './src/injectApp.tsx',
    './config': './src/config.ts',
    './newReact': require.resolve('react'),
    './newReactDOM': require.resolve('react-dom'),
  },

  shared: [
    'react-dom',
    {
      react: {
        import: 'react', // the "react" package will be used a provided and fallback module
        shareKey: 'newReact', // under this name the shared module will be placed in the share scope
        shareScope: 'modern', // share scope with this name will be used
        singleton: true, // only a single version of the shared module is allowed
      },
      '@redpanda-data/ui': {
        import: '@redpanda-data/ui',
      },
    },
  ],
};
