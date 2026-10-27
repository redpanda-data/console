import { defineRule, type ESTree, type SourceCode } from '@oxlint/plugins';

import { importOf } from '../ast.ts';

// `title` names embedded content (iframe, embed, object), carries spec-defined meaning (abbr
// expansion, dfn term, alternate stylesheet names) or labels SVG/MathML graphics, so the
// Registry Tooltip is not a replacement there.
const TITLE_HAS_MEANING = new Set(['abbr', 'dfn', 'embed', 'frame', 'iframe', 'link', 'math', 'object', 'style']);
const SVG_ELEMENTS = new Set([
  'circle',
  'clipPath',
  'defs',
  'desc',
  'ellipse',
  'foreignObject',
  'g',
  'image',
  'line',
  'linearGradient',
  'marker',
  'mask',
  'path',
  'pattern',
  'polygon',
  'polyline',
  'radialGradient',
  'rect',
  'stop',
  'svg',
  'symbol',
  'text',
  'textPath',
  'tspan',
  'use',
]);
// Registry components that forward `title` to the DOM element they render.
const INTRINSIC_ELEMENT = /^[a-z][a-z0-9]*$/u;
const REGISTRY_EXPORTS: Record<string, string> = { button: 'Button', input: 'Input' };
const REGISTRY_MODULE = /(?:^|\/)redpanda-ui\/components\/(button|input)(?:\.tsx?|\/index\.tsx?)?$/u;
const MESSAGE =
  'Native `title` tooltips are unstyled and unreachable by keyboard and touch. Use the Registry Tooltip (`components/redpanda-ui/components/tooltip`) and keep `aria-label` for the accessible name.';

function insideSvg(element: ESTree.JSXOpeningElement) {
  let current = element.parent?.parent;
  while (current) {
    if (
      current.type === 'JSXElement' &&
      current.openingElement.name.type === 'JSXIdentifier' &&
      current.openingElement.name.name === 'svg'
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isNativeTooltipHost(element: ESTree.JSXOpeningElement, name: string) {
  if (!INTRINSIC_ELEMENT.test(name) || TITLE_HAS_MEANING.has(name)) {
    return false;
  }
  return !(SVG_ELEMENTS.has(name) || insideSvg(element));
}

/** `<Button>` imported (under any alias) from a Registry module, or `<Ui.Button>` from its namespace. */
function isRegistryComponent(sourceCode: SourceCode, identifier: ESTree.JSXIdentifier, member?: string) {
  const binding = importOf(sourceCode, identifier);
  const module = binding && REGISTRY_MODULE.exec(binding.source)?.[1];
  if (!(binding && module)) {
    return false;
  }
  const exported = member === undefined ? binding.imported : member;
  const throughNamespace = member === undefined || binding.imported === '*';
  return throughNamespace && exported === REGISTRY_EXPORTS[module];
}

function forwardsTitle(sourceCode: SourceCode, element: ESTree.JSXOpeningElement) {
  const { name } = element;
  if (name.type === 'JSXIdentifier') {
    return isNativeTooltipHost(element, name.name) || isRegistryComponent(sourceCode, name);
  }
  if (name.type === 'JSXMemberExpression' && name.object.type === 'JSXIdentifier') {
    return isRegistryComponent(sourceCode, name.object, name.property.name);
  }
  return false;
}

export default defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow native `title` tooltips on HTML elements and Registry Button/Input; use the Registry Tooltip.',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(element) {
        const title = element.attributes.find(
          (attribute) =>
            attribute.type === 'JSXAttribute' &&
            attribute.name.type === 'JSXIdentifier' &&
            attribute.name.name === 'title'
        );
        if (title && forwardsTitle(context.sourceCode, element)) {
          context.report({ node: title, message: MESSAGE });
        }
      },
    };
  },
});
