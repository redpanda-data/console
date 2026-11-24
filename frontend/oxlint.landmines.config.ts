import { defineConfig } from 'oxlint';
import landmines from 'ultracite/oxlint/landmines';

import consolePolicy from './.oxlintrc.json' with { type: 'json' };
import { fileURLToPath } from 'node:url';

const structure = fileURLToPath(new URL('./lint-rules/landmines-structure.ts', import.meta.url));
const style = fileURLToPath(new URL('./lint-rules/landmines-style.ts', import.meta.url));
const adapters = new Map([
  ['landmines-structure', structure],
  ['landmines-style', style],
]);

export default defineConfig({
  extends: [
    {
      ...landmines,
      jsPlugins: landmines.jsPlugins.map((plugin) => ({
        ...plugin,
        specifier: adapters.get(plugin.name) ?? plugin.specifier,
      })),
    },
  ],
  plugins: [],
  categories: { correctness: 'off' },
  ignorePatterns: consolePolicy.ignorePatterns,
});
