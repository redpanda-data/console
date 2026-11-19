import style from '@interfere/landmines/style';

const BIOME_DIRECTIVE = /^\s*biome-ignore(?:-all|-start|-end)?\s/u;
const COPYRIGHT_NOTICE = /^\s*\*?\s*Copyright 20\d{2} Redpanda Data, Inc\.\s*$/mu;
const LICENSE_TEXT = 'Use of this software is governed by the Business Source License';
const noComments = style.rules?.['no-comments'];
const createNoComments = noComments?.create;
if (!createNoComments) {
  throw new Error('Expected Landmines no-comments to expose a create visitor');
}

export default {
  ...style,
  rules: {
    ...style.rules,
    'no-comments': {
      ...noComments,
      create(context: Parameters<typeof createNoComments>[0]) {
        const protectedComments = new Set(
          context.sourceCode
            .getAllComments()
            .filter(
              (comment) =>
                BIOME_DIRECTIVE.test(comment.value) ||
                (comment.loc.start.line === 1 &&
                  COPYRIGHT_NOTICE.test(comment.value) &&
                  (comment.type === 'Line' || comment.value.includes(LICENSE_TEXT)))
            )
            .map((comment) => `${comment.loc.start.line}:${comment.loc.start.column}`)
        );
        const report = (diagnostic: Parameters<typeof context.report>[0]) => {
          const { loc } = diagnostic;
          const start = loc && ('start' in loc ? loc.start : loc);
          if (diagnostic.messageId === 'forbidden' && start && protectedComments.has(`${start.line}:${start.column}`)) {
            return;
          }
          context.report(diagnostic);
        };
        return createNoComments(Object.create(context, { report: { value: report } }));
      },
    },
  },
};
