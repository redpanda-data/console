import { defineRule, type ESTree, type SourceCode } from '@oxlint/plugins';

import {
  type FunctionNode,
  type Identifier,
  importOf,
  isFunction,
  isNode,
  memberPath,
  type Node,
  unwrap,
} from '../ast.ts';

const HOOK_NAME = /^use[A-Z0-9]/u;
const hooklessMessage = (name: string) =>
  `"${name}" calls no hook while it runs, so it is a plain function with a hook's name and call-site rules. Rename it (for example, drop the "use" prefix); do not add a hook call just to keep the name. Hook calls inside callbacks it returns or registers do not count.`;

/** A named import keeps its exported name under any alias; React 19 `use` counts only from React. */
function isHookIdentifier(sourceCode: SourceCode, identifier: Identifier) {
  const binding = importOf(sourceCode, identifier);
  if (!binding || binding.imported === 'default' || binding.imported === '*') {
    return HOOK_NAME.test(identifier.name);
  }
  return binding.imported === 'use' ? binding.source === 'react' : HOOK_NAME.test(binding.imported);
}

function isHookCallee(sourceCode: SourceCode, callee: Node) {
  const target = unwrap(callee);
  if (target?.type === 'Identifier') {
    return isHookIdentifier(sourceCode, target);
  }
  const member = memberPath(target);
  const property = member?.path.at(-1);
  if (!(member && property)) {
    return false;
  }
  return HOOK_NAME.test(property) || (property === 'use' && importOf(sourceCode, member.root)?.source === 'react');
}

/** An immediately invoked function runs as part of the caller. */
function runsImmediately(node: FunctionNode) {
  const { parent } = node;
  return parent?.type === 'CallExpression' && unwrap(parent.callee) === node;
}

function callsHook(sourceCode: SourceCode, value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((child) => callsHook(sourceCode, child));
  }
  if (!isNode(value) || (isFunction(value) && !runsImmediately(value))) {
    return false;
  }
  if (value.type === 'CallExpression' && isHookCallee(sourceCode, value.callee)) {
    return true;
  }
  return Object.entries(value).some(([key, child]) => key !== 'parent' && callsHook(sourceCode, child));
}

export default defineRule({
  meta: {
    type: 'problem',
    docs: { description: 'Disallow `use*` functions that call no hook while they run.' },
    schema: [],
  },
  create(context) {
    const check = (name: string, fn: FunctionNode, reportNode: ESTree.Node) => {
      if (!HOOK_NAME.test(name) || fn.body === null) {
        return;
      }
      if (!callsHook(context.sourceCode, [fn.params, fn.body])) {
        context.report({ node: reportNode, message: hooklessMessage(name) });
      }
    };
    return {
      FunctionDeclaration(node) {
        if (node.id) {
          check(node.id.name, node, node.id);
        }
      },
      VariableDeclarator(node) {
        const init = unwrap(node.init);
        if (node.id.type === 'Identifier' && isFunction(init)) {
          check(node.id.name, init, node.id);
        }
      },
    };
  },
});
