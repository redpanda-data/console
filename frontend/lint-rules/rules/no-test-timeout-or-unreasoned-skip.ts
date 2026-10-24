import { defineRule, type ESTree, type SourceCode } from '@oxlint/plugins';

import { findVariable, isFunction, memberName, type Node, propertyValue, stringValue, unwrap } from '../ast.ts';
import { hasSubstantiveReason, hasTrackingIssue, parseSuppression } from '../reasons.ts';
import { isBunExport, isHook, isMockObject, isTestCode, type TestChain, testChain } from '../test-code.ts';

const TIMEOUT_KEYS = ['retries', 'retry', 'timeout'];
const CONFIG_TIMEOUT_KEYS = ['hookTimeout', 'retry', 'testTimeout'];
const RUNTIME_OVERRIDES = new Set(['setTimeout', 'slow']);
const REGISTRATION_MODIFIERS = new Set([
  'concurrent',
  'describe',
  'each',
  'fails',
  'failing',
  'fixme',
  'for',
  'if',
  'only',
  'parallel',
  'runIf',
  'sequential',
  'serial',
  'skip',
  'skipIf',
  'todo',
  'todoIf',
]);
const SKIPS = new Set(['fixme', 'skip', 'todo']);
const SKIPPING_APIS = new Set(['xdescribe', 'xit', 'xtest']);
// Whether a literal condition of `true` skips (`skipIf`) or runs (`if`/`runIf`) the test.
const SKIPS_WHEN: Record<string, boolean> = { if: false, runIf: false, skipIf: true, todoIf: true };
const STATEMENT = /(?:Declaration|Statement)$/u;

const TIMEOUT_MESSAGE =
  'Per-test timeout or retry override: it hides slow waits instead of removing them. Await the milestone and keep time budgets in the suite configuration, which is also where subprocess and full-stack suites set theirs.';
const SKIP_MESSAGE =
  'Static skip without a tracking issue and reason: say why in a comment above it, at the start of its body, or in the skip description, and name the issue (UX-1234, #1234, owner/repo#1234 or an issue URL). Conditional skips such as `skipIf(condition)` stay allowed.';

const hasAnyKey = (node: Node | undefined, keys: string[]) =>
  keys.some((key) => propertyValue(node, key) !== undefined);

/** Playwright's `testInfo.setTimeout()`: the second parameter of a test body. */
function isTestInfoTimeout(sourceCode: SourceCode, callee: Node) {
  const object = callee.type === 'MemberExpression' ? unwrap(callee.object) : undefined;
  if (memberName(callee) !== 'setTimeout' || object?.type !== 'Identifier') {
    return false;
  }
  const definition = findVariable(sourceCode, object)?.defs[0];
  const fn = definition?.node;
  if (definition?.type !== 'Parameter' || !isFunction(fn) || fn.params[1]?.range[0] !== definition.name.range[0]) {
    return false;
  }
  return fn.parent?.type === 'CallExpression' && testChain(sourceCode, fn.parent.callee) !== undefined;
}

/** `test(name, fn, 5000)`, `test(name, fn, { retry })` and `test(name, { timeout }, fn)`. */
function registrationOverridesTimeout(call: ESTree.CallExpression) {
  const [, second, third] = call.arguments.map((argument) => unwrap(argument));
  if (third !== undefined && !isFunction(third)) {
    return third.type !== 'ObjectExpression' || hasAnyKey(third, TIMEOUT_KEYS);
  }
  return hasAnyKey(second, TIMEOUT_KEYS);
}

function chainOverridesTimeout(chain: TestChain, call: ESTree.CallExpression) {
  const last = chain.members.at(-1);
  if (last === 'configure') {
    return hasAnyKey(call.arguments[0], TIMEOUT_KEYS);
  }
  if (last !== undefined && RUNTIME_OVERRIDES.has(last)) {
    return true;
  }
  if (isHook(chain.api)) {
    // Bun and Rstest hooks take the timeout as their second argument.
    const timeout = unwrap(call.arguments[1]);
    return chain.members.length === 0 && timeout !== undefined && !isFunction(timeout);
  }
  return chain.members.every((member) => REGISTRATION_MODIFIERS.has(member)) && registrationOverridesTimeout(call);
}

function overridesTimeout(sourceCode: SourceCode, call: ESTree.CallExpression) {
  const callee = unwrap(call.callee);
  if (!callee) {
    return false;
  }
  if (isBunExport(sourceCode, callee, 'setDefaultTimeout') || isTestInfoTimeout(sourceCode, callee)) {
    return true;
  }
  if (callee.type === 'MemberExpression' && isMockObject(sourceCode, callee.object)) {
    const method = memberName(callee);
    return method === 'setTimeout' || (method === 'setConfig' && hasAnyKey(call.arguments[0], CONFIG_TIMEOUT_KEYS));
  }
  const chain = testChain(sourceCode, callee);
  return chain !== undefined && chainOverridesTimeout(chain, call);
}

/** `test.skip()` under `if`/`?:`/`&&` in its test body is a runtime decision, not a static skip. */
function underCondition(node: Node) {
  let child = node;
  let current = node.parent;
  while (current && !isFunction(current)) {
    if ((current.type === 'IfStatement' || current.type === 'ConditionalExpression') && current.test !== child) {
      return true;
    }
    if (current.type === 'LogicalExpression' && current.right === child) {
      return true;
    }
    child = current;
    current = current.parent;
  }
  return false;
}

/** `skipIf(true)` and `runIf(false)` are static; any other condition is a runtime decision. */
function literalCondition(chain: TestChain): 'dynamic' | 'skips' | undefined {
  for (const member of chain.members) {
    const skipsWhen = SKIPS_WHEN[member];
    const condition = unwrap(chain.calls.find((call) => memberName(call.callee) === member)?.arguments[0]);
    if (skipsWhen !== undefined && condition?.type !== 'Literal') {
      return 'dynamic';
    }
    if (skipsWhen !== undefined && condition?.type === 'Literal' && Boolean(condition.value) === skipsWhen) {
      return 'skips';
    }
  }
}

/** `test.skip(title, body)`, `test.skip()`, `test.skip(true, why)`; `test.skip(condition, why)` is dynamic. */
function isStaticDirectSkip(call: ESTree.CallExpression) {
  const [first, second] = call.arguments.map((argument) => unwrap(argument));
  if (first === undefined) {
    return !underCondition(call);
  }
  if (stringValue(first) !== undefined || first.type === 'TemplateLiteral' || isFunction(second)) {
    return true;
  }
  return first.type === 'Literal' && first.value === true;
}

function skipsWithOptions(call: ESTree.CallExpression) {
  return call.arguments.some((argument) =>
    ['skip', 'todo'].some((key) => {
      const value = unwrap(propertyValue(argument, key));
      return value?.type === 'Literal' && value.value === true;
    })
  );
}

function isStaticSkip(chain: TestChain, call: ESTree.CallExpression) {
  const condition = literalCondition(chain);
  if (condition !== undefined || SKIPPING_APIS.has(chain.api) || skipsWithOptions(call)) {
    return condition !== 'dynamic';
  }
  const index = chain.members.findIndex((member) => SKIPS.has(member));
  if (index === -1) {
    return false;
  }
  const direct = chain.calls.length === 0 && index === chain.members.length - 1;
  return !direct || chain.members[index] === 'todo' || isStaticDirectSkip(call);
}

function statementOf(node: Node) {
  let current = node;
  while (current.parent && !STATEMENT.test(current.type)) {
    current = current.parent;
  }
  return current;
}

/** The comment lines directly above a statement, skipping comments that trail earlier code. */
function commentsAbove(sourceCode: SourceCode, statement: Node) {
  const block: string[] = [];
  let { line } = statement.loc.start;
  for (const comment of sourceCode.getCommentsBefore(statement).toReversed()) {
    const before = (sourceCode.lines[comment.loc.start.line - 1] ?? '').slice(0, comment.loc.start.column);
    if (comment.loc.end.line < line - 1 || before.trim() !== '') {
      break;
    }
    block.unshift(comment.value);
    ({ line } = comment.loc.start);
  }
  return block;
}

/** Comments before the first statement of the skipped test's body. */
function commentsAtBodyStart(sourceCode: SourceCode, call: ESTree.CallExpression) {
  const body = call.arguments.map((argument) => unwrap(argument)).findLast(isFunction)?.body;
  if (body?.type !== 'BlockStatement') {
    return [];
  }
  const end = body.body[0]?.range[0] ?? body.range[1];
  return sourceCode
    .getAllComments()
    .filter((comment) => comment.range[0] > body.range[0] && comment.range[1] <= end)
    .map((comment) => comment.value);
}

function isTracked(sourceCode: SourceCode, chain: TestChain, call: ESTree.CallExpression) {
  const comments = [...commentsAbove(sourceCode, statementOf(call)), ...commentsAtBodyStart(sourceCode, call)];
  const [first, second] = call.arguments;
  const description = chain.members.includes('todo') ? stringValue(first) : (stringValue(first) ?? stringValue(second));
  const isTitle = !chain.members.includes('todo') && stringValue(first) !== undefined;
  const text = [
    ...comments.map((comment) => parseSuppression(comment)?.reason ?? comment),
    isTitle ? '' : description,
  ].join(' ');
  return hasTrackingIssue(text) && hasSubstantiveReason(text);
}

export default defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow per-test timeout and retry overrides, and require a tracking issue and reason for static skips and todos.',
    },
    schema: [],
  },
  create(context) {
    if (!isTestCode(context.filename)) {
      return {};
    }
    const { sourceCode } = context;
    return {
      CallExpression(call) {
        if (overridesTimeout(sourceCode, call)) {
          context.report({ node: call, message: TIMEOUT_MESSAGE });
        }
        // A curried registration such as `test.skipIf(x)(name, fn)` is judged once, at its outer call.
        if (call.parent?.type === 'CallExpression' && unwrap(call.parent.callee) === call) {
          return;
        }
        const chain = testChain(sourceCode, call.callee);
        if (chain && !isHook(chain.api) && isStaticSkip(chain, call) && !isTracked(sourceCode, chain, call)) {
          context.report({ node: call, message: SKIP_MESSAGE });
        }
      },
    };
  },
});
