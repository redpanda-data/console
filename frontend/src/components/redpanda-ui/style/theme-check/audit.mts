/// <reference types="node" />

/**
 * Assert a palette override sheet against the registry's token surface. An override fails silently by
 * construction — a name theme.css does not declare compiles to nothing, leaving our value where the
 * sheet meant its own — so every check here needs the two files read together.
 *
 * Run by `cli.mts`, which ships with the theme.
 */

import { describeHole, findOverrideHoles } from './rule.mts';
import { readFileSync } from 'node:fs';

const DECL = /^\s*(--color-[a-z0-9-]+)\s*:\s*([^;]+);/i;
/** Either spelling opening a block: consumers still ship `.dark` sheets. */
const DARK_SELECTOR = /(\[data-theme=['"]?dark['"]?\]|\.dark\b)[^{]*\{/;
const COLOR_PREFIX = /^--color-/;
const VAR_REF = /^var\((--[a-z0-9-]+)\)$/i;
const STATIC = /^--color-static-/;
/** `static-dark` / `static-light` themselves, not their `-hover`/`-accent`/`-foreground` parts. */
const STATIC_GROUND = /^--color-static-(?:dark|light)$/;

type Block = 'light' | 'dark';

type Declaration = {
  name: string;
  value: string;
  line: number;
  block: Block;
};

export type AuditOptions = {
  themePath: string;
  overridesPath: string;
  /** Scale prefixes the sheet owns outright (`ink`, `ember`): its palette, not overrides of ours. */
  palettePrefixes?: string[];
  /** How the sheet's path is printed in messages. Defaults to `overridesPath`. */
  label?: string;
};

export type AuditResult = {
  failures: string[];
  /** Overrides naming a registry role — everything but the sheet's own scales. */
  semanticCount: number;
  roleCount: number;
  registryCount: number;
  /** Roles the sheet deliberately leaves to the registry. */
  inheritedCount: number;
};

const count = (text: string, char: string): number => text.split(char).length - 1;

/**
 * Every `--color-*` declaration with the block it is in. Depth-tracked rather than assuming one trailing
 * dark block, so anything a sheet puts *after* that block is not read as dark.
 */
const parse = (file: string): Declaration[] => {
  const declarations: Declaration[] = [];
  let depth = 0;
  /** The depth the current dark block opened at; null outside one. */
  let darkDepth: number | null = null;

  const lines = readFileSync(file, 'utf8').split('\n');
  for (const [index, line] of lines.entries()) {
    const match = DECL.exec(line);
    if (match) {
      declarations.push({
        name: match[1],
        value: match[2].trim(),
        line: index + 1,
        block: darkDepth === null ? 'light' : 'dark',
      });
    }
    const opens = count(line, '{');
    if (opens > 0 && darkDepth === null && DARK_SELECTOR.test(line)) {
      darkDepth = depth;
    }
    depth += opens - count(line, '}');
    if (darkDepth !== null && depth <= darkDepth) {
      darkDepth = null;
    }
  }
  return declarations;
};

const bareName = (name: string): string => name.replace(COLOR_PREFIX, '');

type Sheet = {
  /** How the sheet's path is printed in messages. */
  rel: string;
  registryNames: ReadonlySet<string>;
  overrides: Declaration[];
  isPalette: (name: string) => boolean;
};

/** dead — a name theme.css does not declare, so the declaration paints nothing. */
const findDead = ({ rel, registryNames, overrides, isPalette }: Sheet): string[] =>
  overrides
    .filter((declaration) => !(isPalette(declaration.name) || registryNames.has(declaration.name)))
    .map((declaration) => `${rel}:${declaration.line}  dead override — theme.css does not declare ${declaration.name}`);

/** duplicate — the same name twice in one block, so the first is unreachable. */
const findDuplicates = ({ rel, overrides }: Sheet): string[] => {
  const failures: string[] = [];
  for (const block of ['light', 'dark'] as const) {
    const seen = new Map<string, number>();
    for (const declaration of overrides.filter((other) => other.block === block)) {
      const first = seen.get(declaration.name);
      if (first === undefined) {
        seen.set(declaration.name, declaration.line);
      } else {
        failures.push(
          `${rel}:${declaration.line}  duplicate — ${declaration.name} also declared at line ${first}, so that one is dead`
        );
      }
    }
  }
  return failures;
};

/** unresolved — a `var()` chain with nothing behind it. The dark block inherits the light block's names. */
const findUnresolved = ({ rel, registryNames, overrides }: Sheet): string[] => {
  const lightNames = new Set(
    overrides.filter((declaration) => declaration.block === 'light').map((declaration) => declaration.name)
  );
  const inScope = (declaration: Declaration, reference: string): boolean =>
    lightNames.has(reference) ||
    registryNames.has(reference) ||
    overrides.some((other) => other.block === declaration.block && other.name === reference);

  return overrides.flatMap((declaration) => {
    const match = VAR_REF.exec(declaration.value);
    if (!match || inScope(declaration, match[1])) {
      return [];
    }
    return [
      `${rel}:${declaration.line}  unresolved — ${declaration.name} points at ${match[1]}, which nothing declares`,
    ];
  });
};

/** flipped — a `static-*` role in the dark block, which is the one family with no dark value. */
const findFlippedStatics = ({ rel, overrides }: Sheet): string[] =>
  overrides
    .filter((declaration) => declaration.block === 'dark' && STATIC.test(declaration.name))
    .map(
      (declaration) =>
        `${rel}:${declaration.line}  flipped — ${declaration.name} is declared in the dark block, but the static-* family is the one family with no dark value by definition. Its paired -foreground does not flip either, so moving the ground here is what puts light ink on a light fill (or dark on dark) in exactly one theme.`
    );

/** incomplete — a static ground with no ink. Light-block only: the dark block is `flipped` already. */
const findIncompleteStatics = ({ rel, registryNames, overrides }: Sheet): string[] =>
  overrides
    .filter((declaration) => declaration.block === 'light' && STATIC_GROUND.test(declaration.name))
    .filter((ground) => {
      const ink = `${ground.name}-foreground`;
      return registryNames.has(ink) && !overrides.some((declaration) => declaration.name === ink);
    })
    .map(
      (ground) =>
        `${rel}:${ground.line}  incomplete — ${ground.name} is overridden but ${ground.name}-foreground is not, so the ink on this ground stays the registry's while the ground is yours`
    );

/**
 * hole — half a family, per `rule.mts`. Per block, because the dark block is its own complete sheet: a
 * rung set only in light leaves dark taking the registry's step.
 */
const findHoles = ({ rel, registryNames }: Sheet, semantic: Declaration[]): string[] => {
  const failures: string[] = [];
  const declared = new Set([...registryNames].map(bareName));

  for (const block of ['light', 'dark'] as const) {
    const overridden = new Set(
      semantic
        .filter((declaration) => declaration.block === block || (block === 'dark' && declaration.block === 'light'))
        .map((declaration) => bareName(declaration.name))
    );
    // Report against the block that is missing the rung, so the line number lands where it is set.
    const declaredHere = new Set(
      semantic.filter((declaration) => declaration.block === block).map((declaration) => bareName(declaration.name))
    );
    for (const hole of findOverrideHoles(declared, overridden)) {
      // The obliging token is light-only, so the light block already reported it.
      if (block === 'dark' && !declaredHere.has(hole.because)) {
        continue;
      }
      const at = semantic.find(
        (declaration) => declaration.block === block && declaration.name === `--color-${hole.because}`
      );
      failures.push(`${rel}:${at?.line ?? 0}  ${hole.kind} hole (${block}) — ${describeHole(hole)}`);
    }
  }
  return failures;
};

export const auditThemeOverrides = ({
  themePath,
  overridesPath,
  palettePrefixes = [],
  label,
}: AuditOptions): AuditResult => {
  const sheet: Sheet = {
    isPalette: (name) => {
      const bare = bareName(name);
      return palettePrefixes.some((prefix) => bare === prefix || bare.startsWith(`${prefix}-`));
    },
    overrides: parse(overridesPath),
    registryNames: new Set(parse(themePath).map((declaration) => declaration.name)),
    rel: label ?? overridesPath,
  };
  const semantic = sheet.overrides.filter((declaration) => !sheet.isPalette(declaration.name));
  const covered = new Set(semantic.map((declaration) => declaration.name));

  return {
    failures: [
      ...findDead(sheet),
      ...findDuplicates(sheet),
      ...findUnresolved(sheet),
      ...findFlippedStatics(sheet),
      ...findIncompleteStatics(sheet),
      ...findHoles(sheet, semantic),
    ],
    inheritedCount: [...sheet.registryNames].filter((name) => !covered.has(name)).length,
    registryCount: sheet.registryNames.size,
    roleCount: covered.size,
    semanticCount: semantic.length,
  };
};
