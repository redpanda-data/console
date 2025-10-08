const deps = require('./package.json').dependencies;

module.exports = {
  filename: 'embedded.js',
  name: 'rp_console',

  exposes: {
    './EmbeddedApp': './src/embedded-app.tsx',
    './injectApp': './src/inject-app.tsx',
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
