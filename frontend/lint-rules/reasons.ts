// A reason is a lexical heuristic: it rejects empty text, template placeholders and filler,
// not explanations that are wrong. Reviewers still judge whether the reason holds.
const JIRA_KEY = /\b[A-Z][A-Z0-9]{1,9}-[1-9]\d*\b/u;
const GITHUB_ISSUE =
  /(?:^|[\s(])(?:[\w.-]+\/[\w.-]+)?#[1-9]\d*\b|https?:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:issues|pull)\/\d+/u;
const URL = /https?:\/\/\S+/gu;
const REFERENCES = new RegExp(`${JIRA_KEY.source}|${GITHUB_ISSUE.source}`, 'gu');
const PLACEHOLDER = /<[^>]*>/gu;
const WORD = /\p{L}[\p{L}\p{N}'’-]*/gu;
const FILLER = new Set([
  'a',
  'above',
  'an',
  'and',
  'as',
  'at',
  'be',
  'because',
  'below',
  'biome',
  'by',
  'disable',
  'disabled',
  'eslint',
  'explanation',
  'fine',
  'fixme',
  'for',
  'hack',
  'here',
  'ignore',
  'ignored',
  'in',
  'intended',
  'intentional',
  'intentionally',
  'is',
  'it',
  'its',
  'later',
  'lint',
  'necessary',
  'needed',
  'of',
  'ok',
  'okay',
  'on',
  'or',
  'oxlint',
  'reason',
  'required',
  'rule',
  'see',
  'skip',
  'skipped',
  'suppress',
  'suppressed',
  'tbd',
  'temp',
  'temporary',
  'that',
  'the',
  'this',
  'to',
  'todo',
  'we',
  'wip',
  'workaround',
  'xxx',
]);
const MINIMUM_WORDS = 2;

/** True when the text names a Jira key (UX-1234) or a GitHub issue (#12, owner/repo#12, issue URL). */
export function hasTrackingIssue(text: string) {
  return JIRA_KEY.test(text) || GITHUB_ISSUE.test(text);
}

/** True when, past references and filler, at least two words remain to say why. */
export function hasSubstantiveReason(text: string) {
  const prose = text.replace(URL, ' ').replace(REFERENCES, ' ').replace(PLACEHOLDER, ' ');
  const words = (prose.match(WORD) ?? []).filter((word) => !FILLER.has(word.toLowerCase()));
  return words.length >= MINIMUM_WORDS;
}

// Directives are only recognized at the start of a real comment, so text in strings,
// templates or JSX, and prose that mentions a directive mid-sentence, are not suppressions.
const TS_DIRECTIVE = /^\s*\*?\s*@ts-(expect-error|ignore|nocheck)(?![\w-])([\s\S]*)$/u;
const LINT_DIRECTIVE =
  /^\s*\*?\s*(?:eslint|oxlint)-(disable|disable-line|disable-next-line|enable)(?![\w-])([\s\S]*)$/u;
const BIOME_DIRECTIVE = /^\s*\*?\s*biome-ignore(-all|-start|-end)?(?![\w-])([\s\S]*)$/u;
const LINT_JUSTIFICATION = /\s-{2,}\s([\s\S]*)$/u;
const LEADING_PUNCTUATION = /^[\s:-]+/u;

export type Suppression = { tool: 'biome' | 'lint' | 'ts'; directive: string; reason: string };

/** Text after the first `:` outside the category list, so `noRestrictedImports(node:fs)` keeps its colon. */
function biomeExplanation(rest: string) {
  let depth = 0;
  for (const [index, character] of [...rest].entries()) {
    depth += Number(character === '(') - Number(character === ')');
    if (character === ':' && depth === 0) {
      return rest.slice(index + 1);
    }
  }
  return '';
}

/** A comment's suppression directive and the explanation written on it, if it is one. */
export function parseSuppression(comment: string): Suppression | undefined {
  const ts = TS_DIRECTIVE.exec(comment);
  if (ts) {
    return { tool: 'ts', directive: ts[1] ?? '', reason: (ts[2] ?? '').replace(LEADING_PUNCTUATION, '') };
  }
  const lint = LINT_DIRECTIVE.exec(comment);
  if (lint) {
    return { tool: 'lint', directive: lint[1] ?? '', reason: LINT_JUSTIFICATION.exec(lint[2] ?? '')?.[1] ?? '' };
  }
  const biome = BIOME_DIRECTIVE.exec(comment);
  if (biome) {
    return { tool: 'biome', directive: biome[1] ?? '', reason: biomeExplanation(biome[2] ?? '') };
  }
}
