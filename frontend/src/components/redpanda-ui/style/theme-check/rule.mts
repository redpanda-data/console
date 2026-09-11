/**
 * A family you override the rest of, you have to override the states of. Half a family leaves the rest
 * coming from the sheet and the hover falling through to the registry, so a control changes hue under
 * the pointer.
 *
 * One implementation, called by `audit.mts` (the shipped `theme:check` CLI) and by the playground's
 * preset test, so a consumer's checker and ours cannot disagree about what a hole is.
 */

/** A rung the sheet has to set because of one it already set. */
export type OverrideHole = {
  /** The token the sheet is missing. */
  token: string;
  /** The token that obliges it. */
  because: string;
  kind: 'state' | 'sibling';
};

const STATES = ['-hover', '-pressed'] as const;
const WASH = '-wash';
const FOREGROUND = '-foreground';

/**
 * Rest rungs that belong to a family without naming it, so the suffix rule below cannot find them.
 * `surface-recess` is the only one: `surface-subtle` at half alpha, with nothing in its name to key on.
 */
const SIBLING_FAMILY: Record<string, string> = {
  'surface-recess': 'surface-subtle',
};

/** The family a rest rung belongs to — by the map above, or by a `-wash` suffix naming its tone. */
const familyOf = (token: string, declared: ReadonlySet<string>): string | null => {
  const explicit = SIBLING_FAMILY[token];
  if (explicit) {
    return declared.has(explicit) ? explicit : null;
  }
  if (!token.endsWith(WASH)) {
    return null;
  }
  const bare = token.slice(0, -WASH.length);
  return declared.has(bare) ? bare : null;
};

/** Does the sheet recolour `family` — as opposed to only setting the ink that goes on it? */
const recolours = (family: string, overridden: ReadonlySet<string>): boolean => {
  for (const token of overridden) {
    // `-foreground` alone is not a recolour: it is the ink for a fill the sheet inherits, and it
    // carries no hue a wash could be derived from.
    if (token === family || (token.startsWith(`${family}-`) && token !== `${family}${FOREGROUND}`)) {
      return true;
    }
  }
  return false;
};

/**
 * Every rung `overridden` obliges and does not contain. `declared` is the registry's token surface —
 * the authority on which rungs exist, so a sheet is never asked for one the registry does not have.
 */
export const findOverrideHoles = (declared: ReadonlySet<string>, overridden: ReadonlySet<string>): OverrideHole[] => {
  const holes: OverrideHole[] = [];

  for (const token of overridden) {
    for (const state of STATES) {
      if (declared.has(token + state) && !overridden.has(token + state)) {
        holes.push({ token: token + state, because: token, kind: 'state' });
      }
    }
  }

  for (const token of declared) {
    const family = familyOf(token, declared);
    // A rest sibling is not a state of its family, so the loop above cannot see it.
    if (family && recolours(family, overridden) && !overridden.has(token)) {
      holes.push({ token, because: family, kind: 'sibling' });
    }
  }

  return holes.sort((a, b) => a.token.localeCompare(b.token));
};

export const describeHole = ({ token, because, kind }: OverrideHole): string =>
  kind === 'state'
    ? `${because} is overridden but ${token} is not, so the control takes your colour at rest and the registry's under the pointer`
    : `${because} is recoloured but ${token} is not, so that rung stays the registry's hue`;
