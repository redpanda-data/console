import stylelint from 'stylelint';

const ruleName = 'console/no-important';
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: 'Avoid !important except for the global reduced-motion accessibility override.',
});
const reducedMotionValues = new Map([
  ['scroll-behavior', 'auto'],
  ['transition-duration', '0.01ms'],
  ['animation-duration', '0.01ms'],
  ['animation-iteration-count', '1'],
]);
const REDUCED_MOTION = /^\(prefers-reduced-motion:\s*reduce\)$/i;

/** @type {import('stylelint').Rule} */
const noImportant = (enabled) => (root, result) => {
  if (!stylelint.utils.validateOptions(result, ruleName, { actual: enabled, possible: [true] })) {
    return;
  }
  root.walkDecls((declaration) => {
    if (!declaration.important) {
      return;
    }
    const rule = declaration.parent;
    const media = rule?.parent;
    const isReducedMotion =
      rule?.type === 'rule' &&
      rule.selector
        .split(',')
        .map((selector) => selector.trim())
        .toSorted((left, right) => (left < right ? -1 : Number(left > right)))
        .join(',') === '*,*::after,*::before' &&
      media?.type === 'atrule' &&
      media.name === 'media' &&
      REDUCED_MOTION.test(media.params.trim()) &&
      reducedMotionValues.get(declaration.prop) === declaration.value;
    if (!isReducedMotion) {
      stylelint.utils.report({ result, ruleName, message: messages.rejected, node: declaration, word: '!important' });
    }
  });
};
noImportant.ruleName = ruleName;
noImportant.messages = messages;
export default stylelint.createPlugin(ruleName, noImportant);
