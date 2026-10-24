import { defineRule } from '@oxlint/plugins';

import { hasSubstantiveReason, parseSuppression } from '../reasons.ts';

// Closing directives (`*-enable`, `biome-ignore-end`) end a range that was opened with a reason.
const CLOSING = new Set(['-end', 'enable']);
const FORBIDDEN_TS = new Set(['ignore', 'nocheck']);
const MISSING_REASON =
  'Say why this suppression is safe in a few words on the directive itself (`: reason` for Biome, `-- reason` for Oxlint and ESLint, text after `@ts-expect-error`). Placeholders and filler do not count.';
const FORBIDDEN =
  '`@ts-ignore` and `@ts-nocheck` are forbidden: fix the type, or use `@ts-expect-error` with a reason so the suppression fails once the error is gone.';

/** The problem with a comment as a suppression, or undefined when it is not one or says why. */
function suppressionProblem(text: string) {
  const suppression = parseSuppression(text);
  if (!suppression || CLOSING.has(suppression.directive)) {
    return;
  }
  if (suppression.tool === 'ts' && FORBIDDEN_TS.has(suppression.directive)) {
    return FORBIDDEN;
  }
  return hasSubstantiveReason(suppression.reason) ? undefined : MISSING_REASON;
}

export default defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require a stated reason on Biome, Oxlint, ESLint and `@ts-expect-error` suppressions; forbid `@ts-ignore` and `@ts-nocheck`.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const message = suppressionProblem(comment.value);
          if (message) {
            context.report({ loc: comment.loc, message });
          }
        }
      },
    };
  },
});
