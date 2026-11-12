import { defineRule } from '@oxlint/plugins';

const EXCEPTION_MARKER = 'Registry unstyled variant';

/** Keep the precise Biome exception valid if a control is later switched back to a styled variant. */
export default defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'Require the explicit unstyled Button API for its appearance-policy exception.' },
    schema: [],
    messages: { styled: 'The Registry unstyled appearance exception requires a literal variant="unstyled".' },
  },
  create(context) {
    return {
      JSXOpeningElement(element) {
        const attributes = element.attributes.filter((attribute) => attribute.type === 'JSXAttribute');
        const className = attributes.find(
          (attribute) => attribute.name.type === 'JSXIdentifier' && attribute.name.name === 'className'
        );
        if (!className) {
          return;
        }
        const hasException = [
          ...context.sourceCode.getCommentsBefore(className),
          ...context.sourceCode.getCommentsInside(className),
        ].some(
          (comment) =>
            comment.value.includes('lint/nursery/noTailwindRestyledComponents') &&
            comment.value.includes(EXCEPTION_MARKER)
        );
        if (!hasException) {
          return;
        }
        const variant = attributes.find(
          (attribute) => attribute.name.type === 'JSXIdentifier' && attribute.name.name === 'variant'
        );
        if (variant?.value?.type !== 'Literal' || variant.value.value !== 'unstyled') {
          context.report({ node: className, messageId: 'styled' });
        }
      },
    };
  },
});
