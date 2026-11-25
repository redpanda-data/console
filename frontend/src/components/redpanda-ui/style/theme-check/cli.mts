/// <reference types="node" />

/**
 * `theme:check` — hold a palette override sheet to the registry's token surface. Wire it into the build,
 * so an override that has stopped applying fails there rather than in a hover state nobody screenshots.
 *
 *   bun src/components/redpanda-ui/style/theme-check/cli.mts --overrides src/theme-overrides.css
 *
 *   --overrides  the sheet to check (required)
 *   --theme      the registry's theme.css; defaults to `../theme.css`, where the theme item installs it
 *   --palette    comma-separated scale prefixes your sheet owns outright (`ink,ember`)
 *
 * Runs under `bun`, or `node` 24+.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { format as formatCliOutput } from 'node:util';
import { auditThemeOverrides } from './audit.mts';

const HERE = import.meta.dirname;

const flag = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};

class UsageError extends Error {
  override name = 'UsageError';
}

function usage(problem: string): never {
  throw new UsageError(`${problem}\n\nUsage: theme:check --overrides <path> [--theme <path>] [--palette ink,ember]\n`);
}

/** Relative inside the project; absolute outside it, where relative is a pile of `..`. */
const forOutput = (target: string): string => {
  const nearby = path.relative(process.cwd(), target);
  return nearby.startsWith('..') ? target : nearby;
};

function main() {
  const overridesFlag = flag('overrides');
  if (!(overridesFlag !== undefined && overridesFlag !== '')) {
    usage('Missing --overrides: the palette override sheet to check.');
  }

  const overridesPath = path.resolve(process.cwd(), overridesFlag);
  if (!existsSync(overridesPath)) {
    usage(`No such override sheet: ${overridesFlag}`);
  }

  // The theme item installs theme.css beside this script, so the common case needs no flag.
  const themeFlag = flag('theme');
  const themePath =
    themeFlag !== undefined && themeFlag !== ''
      ? path.resolve(process.cwd(), themeFlag)
      : path.resolve(HERE, '../theme.css');
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
    process.stderr.write(`\n${result.failures.length} problem(s) in the theme overrides:\n\n`);
    for (const failure of result.failures) {
      process.stderr.write(`  ${failure}\n`);
    }
    process.stderr.write(
      formatCliOutput(
        '%s\n',
        formatCliOutput(
          `\n${result.semanticCount} semantic overrides checked against ${result.registryCount} registry tokens.` +
            '\nEach name has to be one the registry declares — see theme.css.\n'
        )
      )
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `${forOutput(overridesPath)} ok — ${result.semanticCount} semantic overrides across ` +
      `${result.roleCount} roles, ${result.inheritedCount} registry roles deliberately inherited, no dead names.\n`
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(formatCliOutput('%s\n', error instanceof Error ? error.message : String(error)));
  process.exitCode = error instanceof UsageError ? 2 : 1;
}
