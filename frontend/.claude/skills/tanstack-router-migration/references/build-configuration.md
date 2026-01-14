# Build Configuration

Configuration templates for different build tools.

## Rspack / Rsbuild

```typescript
// rsbuild.config.ts
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { TanStackRouterRspack } from '@tanstack/router-plugin/rspack';

export default defineConfig({
  plugins: [pluginReact()],
  tools: {
    rspack: (config) => {
      config.plugins?.push(
        TanStackRouterRspack({
          target: 'react',
          autoCodeSplitting: true,
          routesDirectory: './src/routes',
          generatedRouteTree: './src/routeTree.gen.ts',
          quoteStyle: 'single',
          semicolons: true,
        })
      );

      // Prevent rebuild loop from generated files
      config.watchOptions = {
        ignored: ['**/routeTree.gen.ts'],
      };

      return config;
    },
  },
});
```

## Vite

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
      quoteStyle: 'single',
      semicolons: true,
    }),
    react(),
  ],
});
```

## Webpack

```typescript
// webpack.config.js
const { TanStackRouterWebpack } = require('@tanstack/router-plugin/webpack');

module.exports = {
  plugins: [
    new TanStackRouterWebpack({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
      quoteStyle: 'single',
      semicolons: true,
    }),
  ],
  watchOptions: {
    ignored: ['**/routeTree.gen.ts'],
  },
};
```

## Vitest Configuration (For Testing)

```typescript
// vitest.config.ts or vitest.config.integration.mts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
      quoteStyle: 'single',
      semicolons: true,
    }),
    react(),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
});
```

## Plugin Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `target` | `'react'` | Required | Framework target |
| `autoCodeSplitting` | `boolean` | `false` | Enable automatic code splitting for routes |
| `routesDirectory` | `string` | `'./src/routes'` | Directory containing route files |
| `generatedRouteTree` | `string` | `'./src/routeTree.gen.ts'` | Output path for generated route tree |
| `quoteStyle` | `'single' \| 'double'` | `'single'` | Quote style for generated code |
| `semicolons` | `boolean` | `true` | Whether to include semicolons in generated code |
| `disableLogging` | `boolean` | `false` | Disable plugin logging |
| `disableTypes` | `boolean` | `false` | Disable type generation |
| `addExtensions` | `boolean` | `false` | Add file extensions to imports |
| `routeFileIgnorePattern` | `string` | - | Regex pattern for files to ignore |

## Biome Configuration

```jsonc
// biome.jsonc
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "files": {
    "ignore": [
      "**/routeTree.gen.ts",
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**"
    ]
  },
  "linter": {
    "enabled": true,
    "rules": {
      "nursery": {
        // navigate() returns Promise but we intentionally don't await it
        "noFloatingPromises": "off"
      }
    }
  },
  "overrides": [
    {
      "include": ["**/routes/**/*"],
      "linter": {
        "rules": {
          "style": {
            // Allow $param.tsx naming convention
            "useFilenamingConvention": "off"
          }
        }
      }
    }
  ]
}
```

## ESLint Configuration

```javascript
// .eslintrc.js or eslint.config.js
module.exports = {
  ignorePatterns: ['routeTree.gen.ts'],
  rules: {
    // Allow fire-and-forget navigation
    '@typescript-eslint/no-floating-promises': 'off',
  },
  overrides: [
    {
      files: ['src/routes/**/*'],
      rules: {
        // Allow $param naming in routes directory
        'unicorn/filename-case': 'off',
      },
    },
  ],
};
```

## TypeScript Configuration

Ensure `routeTree.gen.ts` is included in your TypeScript compilation:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": [
    "src/**/*",
    "src/routeTree.gen.ts"
  ],
  "exclude": [
    "node_modules"
  ]
}
```

## Git Configuration

Add generated file to `.gitignore` if you don't want to commit it (optional):

```gitignore
# .gitignore

# TanStack Router generated file (optional - can be committed)
# src/routeTree.gen.ts
```

**Note:** Many teams choose to commit `routeTree.gen.ts` because:
1. It ensures the app works immediately after cloning
2. It shows route changes in code review
3. It avoids build-time generation in CI

## Environment-Specific Configuration

For different environments (dev vs prod):

```typescript
// rsbuild.config.ts
import { defineConfig } from '@rsbuild/core';
import { TanStackRouterRspack } from '@tanstack/router-plugin/rspack';

const isDev = process.env.NODE_ENV === 'development';

export default defineConfig({
  tools: {
    rspack: (config) => {
      config.plugins?.push(
        TanStackRouterRspack({
          target: 'react',
          autoCodeSplitting: true,
          routesDirectory: './src/routes',
          generatedRouteTree: './src/routeTree.gen.ts',
          // Disable logging in production
          disableLogging: !isDev,
        })
      );
      return config;
    },
  },
});
```

## Monorepo Configuration

For monorepos, ensure paths are relative to the package:

```typescript
// packages/frontend/rsbuild.config.ts
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { TanStackRouterRspack } from '@tanstack/router-plugin/rspack';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  tools: {
    rspack: (config) => {
      config.plugins?.push(
        TanStackRouterRspack({
          target: 'react',
          routesDirectory: resolve(__dirname, './src/routes'),
          generatedRouteTree: resolve(__dirname, './src/routeTree.gen.ts'),
        })
      );
      return config;
    },
  },
});
```
