/// <reference types="node" />

/**
 * `theme:check` — hold a palette override sheet to the registry's token surface. Wire it into the build,
 * so an override that has stopped applying fails there rather than in a hover state nobody screenshots.
 *
 *   bun components/redpanda-ui/style/theme-check/cli.mts --overrides src/theme-overrides.css
 *
 *   --overrides  the sheet to check (required)
 *   --theme      the registry's theme.css; defaults to `../theme.css`, where the theme item installs it
 *   --palette    comma-separated scale prefixes your sheet owns outright (`ink,ember`)
 *
 * Runs under `bun`, or `node` 24+.
 */

/** biome-ignore-all lint/suspicious/noConsole: CLI */

import { auditThemeOverrides } from './audit.mts';
import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const flag = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};

// Annotated on the binding, not just the arrow: that is what narrows the flags below to strings.
const usage: (problem: string) => never = (problem) => {
  console.error(`${problem}\n\nUsage: theme:check --overrides <path> [--theme <path>] [--palette ink,ember]\n`);
  process.exit(2);
};

/** Relative inside the project; absolute outside it, where relative is a pile of `..`. */
const forOutput = (target: string): string => {
  const nearby = relative(process.cwd(), target);
  return nearby.startsWith('..') ? target : nearby;
};

const overridesFlag = flag('overrides');
if (!overridesFlag) {
  usage('Missing --overrides: the palette override sheet to check.');
}

const overridesPath = resolve(process.cwd(), overridesFlag);
if (!existsSync(overridesPath)) {
  usage(`No such override sheet: ${overridesFlag}`);
}

// The theme item installs theme.css beside this script, so the common case needs no flag.
const themeFlag = flag('theme');
const themePath = themeFlag ? resolve(process.cwd(), themeFlag) : resolve(HERE, '../theme.css');
if (!existsSync(themePath)) {
  usage(`No such theme file: ${themeFlag ?? forOutput(themePath)} — pass --theme.`);
}

const result = auditThemeOverrides({
  label: forOutput(overridesPath),
  overridesPath,
  palettePrefixes: (flag('palette') ?? '')
    .split(',')
    .map((prefix) => prefix.trim())
    .filter(Boolean),
  themePath,
});

if (result.failures.length > 0) {
  console.error(`\n${result.failures.length} problem(s) in the theme overrides:\n`);
  for (const failure of result.failures) {
    console.error(`  ${failure}`);
  }
  console.error(
    `\n${result.semanticCount} semantic overrides checked against ${result.registryCount} registry tokens.` +
      '\nEach name has to be one the registry declares — see theme.css.\n'
  );
  process.exit(1);
}

console.log(
  `${forOutput(overridesPath)} ok — ${result.semanticCount} semantic overrides across ` +
    `${result.roleCount} roles, ${result.inheritedCount} registry roles deliberately inherited, no dead names.`
);
