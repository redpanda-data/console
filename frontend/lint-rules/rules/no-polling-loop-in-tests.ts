import { defineRule, type ESTree } from '@oxlint/plugins';

import { isIdentifier, memberName, type Node, someInRun, unwrap } from '../ast.ts';
import { isTestCode } from '../test-code.ts';
import { isWait } from '../waits.ts';

type Loop =
  | ESTree.DoWhileStatement
  | ESTree.ForInStatement
  | ESTree.ForOfStatement
  | ESTree.ForStatement
  | ESTree.WhileStatement;

const COUNTER_OPERATORS = new Set(['<', '<=', '>', '>=']);
const COLLECTION_SIZES = new Set(['length', 'size']);
const MESSAGE =
  'Hand-rolled polling or tick spinning in test code: the loop exits when the scheduler happens to have run enough. Use `waitFor`/`findBy*`, `retryAssertion`, or Playwright `expect.poll`/locator assertions, which retry against a deadline and report the last failure.';

function hasConditionalExit(body: Node) {
  return someInRun(
    body,
    (node) =>
      node.type === 'IfStatement' &&
      someInRun(
        [node.consequent, node.alternate],
        (child) =>
          child.type === 'BreakStatement' || child.type === 'ReturnStatement' || child.type === 'ThrowStatement'
      )
  );
}

function isBound(node: Node | undefined) {
  const target = unwrap(node);
  if (target?.type === 'Literal') {
    return typeof target.value === 'number';
  }
  return target?.type === 'Identifier' || COLLECTION_SIZES.has(memberName(target) ?? '');
}

function advances(loop: ESTree.ForStatement, name: string) {
  return someInRun(
    [loop.update, loop.body],
    (node) =>
      (node.type === 'UpdateExpression' && isIdentifier(node.argument, name)) ||
      (node.type === 'AssignmentExpression' &&
        (node.operator === '+=' || node.operator === '-=') &&
        isIdentifier(node.left, name))
  );
}

/** `i < 3` or `i < items.length` advanced by the loop bounds it without asking the system anything. */
function isCounted(loop: Loop) {
  const test = loop.type === 'ForStatement' ? unwrap(loop.test) : undefined;
  if (loop.type !== 'ForStatement' || test?.type !== 'BinaryExpression' || !COUNTER_OPERATORS.has(test.operator)) {
    return false;
  }
  return [
    [test.left, test.right],
    [test.right, test.left],
  ].some(([counter, bound]) => {
    const name = unwrap(counter);
    return name?.type === 'Identifier' && isBound(bound) && advances(loop, name.name);
  });
}

/** A loop is polling when a predicate about the system decides whether it keeps going. */
function polls(loop: Loop) {
  if (hasConditionalExit(loop.body)) {
    return true;
  }
  if (loop.type === 'ForInStatement' || loop.type === 'ForOfStatement' || loop.test === null) {
    return false;
  }
  const test = unwrap(loop.test);
  return !((test?.type === 'Literal' && test.value === true) || isCounted(loop));
}

export default defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow loops in tests and test helpers that sleep or yield until a condition holds, or that only spin the scheduler.',
    },
    schema: [],
  },
  create(context) {
    if (!isTestCode(context.filename)) {
      return {};
    }
    const awaitsWait = (node: Node) => node.type === 'AwaitExpression' && isWait(context.sourceCode, node.argument);
    const onlyWaits = (body: Node) => {
      const statements = body.type === 'BlockStatement' ? body.body : [body];
      return (
        statements.length > 0 &&
        statements.every((statement) => statement.type === 'ExpressionStatement' && awaitsWait(statement.expression))
      );
    };
    const check = (loop: Loop) => {
      if (someInRun(loop.body, awaitsWait) && (polls(loop) || onlyWaits(loop.body))) {
        context.report({ node: loop, message: MESSAGE });
      }
    };
    return {
      DoWhileStatement: check,
      ForInStatement: check,
      ForOfStatement: check,
      ForStatement: check,
      WhileStatement: check,
    };
  },
});
