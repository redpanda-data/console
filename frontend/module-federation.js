const deps = require('./package.json').dependencies;
const { FederatedTypesPlugin } = require('@module-federation/typescript');

const federationConfig = {
  filename: 'embedded.js',
  name: 'rp_console',

  exposes: {
    './EmbeddedApp': './src/EmbeddedApp.tsx',
    './injectApp': './src/injectApp.tsx',
    './connect-tiles': './src/components/pages/rp-connect/onboarding/connect-tiles.tsx',
    './config': './src/config.ts',
  },

  shared: {
    react: {
      singleton: true,
      requiredVersion: deps.react,
    },
    'react-dom': {
      singleton: true,
      requiredVersion: deps['react-dom'],
    },
    '@redpanda-data/ui': {
      import: '@redpanda-data/ui',
    },
    'react-hook-form': {
      singleton: true,
      requiredVersion: deps['react-hook-form'],
    },
    '@hookform/resolvers': {
      singleton: true,
      requiredVersion: deps['@hookform/resolvers'],
    },
    zod: {
      singleton: true,
      requiredVersion: deps.zod,
    },
    'lucide-react': {
      singleton: false,
      requiredVersion: deps['lucide-react'],
    },
    'class-variance-authority': {
      singleton: false,
      requiredVersion: deps['class-variance-authority'],
    },
    'tailwind-merge': {
      singleton: false,
      requiredVersion: deps['tailwind-merge'],
    },
  },
};

module.exports = {
  ...federationConfig,
  plugins: [
    new FederatedTypesPlugin({
      federationConfig,
    }),
  ],
};
