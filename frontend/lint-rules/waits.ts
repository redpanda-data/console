import type { Definition, ESTree, SourceCode } from '@oxlint/plugins';

import {
  type FunctionNode,
  findVariable,
  globalPath,
  importOf,
  initializerOf,
  isFunction,
  isGlobal,
  memberName,
  memberPath,
  type Node,
  propertyKey,
  someInRun,
  unwrap,
} from './ast.ts';
import type { ClockKind } from './test-code.ts';

// Callbacks that, handed a promise's `resolve`, turn the passage of time into completion.
const SCHEDULERS: Record<string, ClockKind> = {
  'process.nextTick': 'tick',
  queueMicrotask: 'tick',
  requestAnimationFrame: 'frame',
  requestIdleCallback: 'frame',
  setImmediate: 'timer',
  setInterval: 'timer',
  setTimeout: 'timer',
};
const BUN_SLEEPS = new Set(['sleep', 'sleepSync']);
const BUN_GLOBAL_SLEEPS = new Set(['Bun.sleep', 'Bun.sleepSync']);
const BUN_MODULES = new Set(['bun']);
const TIMER_PROMISE_MODULES = new Set(['node:timers/promises', 'timers/promises']);
const TIMER_PROMISE_WAITS = new Set(['scheduler.wait', 'scheduler.yield', 'setImmediate', 'setInterval', 'setTimeout']);
const UTIL_MODULES = new Set(['node:util', 'util']);
const MAX_HELPER_DEPTH = 1;

/** The clock a scheduling function such as `setTimeout` or `window.requestAnimationFrame` runs on. */
export function schedulerKind(sourceCode: SourceCode, callee: Node | null | undefined): ClockKind | undefined {
  const path = globalPath(sourceCode, callee);
  return path === undefined ? undefined : SCHEDULERS[path];
}

/** The exported path a callee reaches inside `module`, through named, namespace or default imports. */
function importedPath(sourceCode: SourceCode, callee: Node, modules: Set<string>) {
  const member = memberPath(callee);
  const binding = member && importOf(sourceCode, member.root);
  if (!(member && binding && modules.has(binding.source))) {
    return;
  }
  const root = binding.imported === '*' || binding.imported === 'default' ? [] : [binding.imported];
  return [...root, ...member.path].join('.');
}

function isPromisifiedTimer(sourceCode: SourceCode, call: ESTree.CallExpression) {
  const callee = unwrap(call.callee);
  if (!(callee && importedPath(sourceCode, callee, UTIL_MODULES) === 'promisify')) {
    return false;
  }
  return schedulerKind(sourceCode, call.arguments[0]) === 'timer';
}

/** `Bun.sleep()` off the global, or `sleep` imported from `bun` under any alias. */
function isBunSleep(sourceCode: SourceCode, callee: Node) {
  const path = globalPath(sourceCode, callee);
  if (path !== undefined && BUN_GLOBAL_SLEEPS.has(path)) {
    return true;
  }
  return BUN_SLEEPS.has(importedPath(sourceCode, callee, BUN_MODULES) ?? '');
}

/** Waits that only the wall clock ends: Bun sleeps, `timers/promises`, `promisify(setTimeout)`, `waitForTimeout`. */
export function isRealTimeWait(sourceCode: SourceCode, call: ESTree.CallExpression) {
  const callee = unwrap(call.callee);
  if (!callee) {
    return false;
  }
  if (
    isBunSleep(sourceCode, callee) ||
    TIMER_PROMISE_WAITS.has(importedPath(sourceCode, callee, TIMER_PROMISE_MODULES) ?? '')
  ) {
    return true;
  }
  return memberName(callee) === 'waitForTimeout' || isPromisifiedTimer(sourceCode, call);
}

function isPromiseExecutor(fn: FunctionNode) {
  const { parent } = fn;
  return parent?.type === 'NewExpression' && parent.arguments[0] === fn && unwrap(parent.callee)?.type === 'Identifier';
}

function isWithResolvers(sourceCode: SourceCode, node: Node | null | undefined) {
  const call = unwrap(node);
  return call?.type === 'CallExpression' && globalPath(sourceCode, call.callee) === 'Promise.withResolvers';
}

/** The first parameter of a `new Promise(executor)`, which is its `resolve`. */
function isExecutorResolve(definition: Definition) {
  const fn = definition.node;
  if (definition.type !== 'Parameter' || !isFunction(fn) || !isPromiseExecutor(fn)) {
    return false;
  }
  return fn.params[0] !== undefined && definition.name.range[0] === fn.params[0].range[0];
}

/** `const { resolve } = Promise.withResolvers()`, under any local name. */
function isDestructuredResolve(sourceCode: SourceCode, definition: Definition) {
  const declarator = definition.node.type === 'VariableDeclarator' ? definition.node : undefined;
  if (declarator?.id.type !== 'ObjectPattern' || !isWithResolvers(sourceCode, declarator.init)) {
    return false;
  }
  return declarator.id.properties.some(
    (property) =>
      propertyKey(property) === 'resolve' &&
      property.type === 'Property' &&
      property.value.range[0] === definition.name.range[0]
  );
}

/** `resolve` from `new Promise((resolve) => ...)` or `Promise.withResolvers()`, under any name. */
function isResolve(sourceCode: SourceCode, node: Node | null | undefined): boolean {
  const target = unwrap(node);
  if (target?.type === 'MemberExpression') {
    const object = unwrap(target.object);
    const init = object?.type === 'Identifier' ? initializerOf(sourceCode, object) : undefined;
    return memberName(target) === 'resolve' && isWithResolvers(sourceCode, init);
  }
  const definition = target?.type === 'Identifier' ? findVariable(sourceCode, target)?.defs[0] : undefined;
  return definition !== undefined && (isExecutorResolve(definition) || isDestructuredResolve(sourceCode, definition));
}

/** A scheduling call whose callback is, or directly calls, a promise's `resolve`. */
export function settlesOnSchedule(sourceCode: SourceCode, call: ESTree.CallExpression) {
  const callback = unwrap(call.arguments[0]);
  if (isFunction(callback)) {
    return someInRun(
      callback.body,
      (node) => node.type === 'CallExpression' && isResolve(sourceCode, node.callee),
      callback
    );
  }
  return isResolve(sourceCode, callback);
}

/** `new Promise(setImmediate)`: the scheduler itself receives `resolve`. */
export function executorSchedulerKind(sourceCode: SourceCode, node: ESTree.NewExpression) {
  const callee = unwrap(node.callee);
  if (!(callee?.type === 'Identifier' && callee.name === 'Promise' && isGlobal(sourceCode, callee))) {
    return;
  }
  return schedulerKind(sourceCode, node.arguments[0]);
}

function isScheduledPromise(sourceCode: SourceCode, node: ESTree.NewExpression) {
  if (executorSchedulerKind(sourceCode, node) !== undefined) {
    return true;
  }
  const executor = unwrap(node.arguments[0]);
  return (
    isFunction(executor) &&
    someInRun(
      executor.body,
      (child) =>
        child.type === 'CallExpression' &&
        schedulerKind(sourceCode, child.callee) !== undefined &&
        settlesOnSchedule(sourceCode, child),
      executor
    )
  );
}

function isMicrotaskTick(sourceCode: SourceCode, node: Node) {
  if (node.type === 'Literal' || (node.type === 'UnaryExpression' && node.operator === 'void')) {
    return true;
  }
  if (node.type === 'Identifier') {
    return node.name === 'undefined' && isGlobal(sourceCode, node);
  }
  if (node.type !== 'CallExpression' || globalPath(sourceCode, node.callee) !== 'Promise.resolve') {
    return false;
  }
  return node.arguments.every((argument) => unwrap(argument)?.type === 'Literal');
}

/** A local helper whose result, or awaited statement, is itself a wait. */
function isWaitHelper(sourceCode: SourceCode, callee: Node | undefined, depth: number) {
  const target = unwrap(callee);
  const definition = target?.type === 'Identifier' ? findVariable(sourceCode, target)?.defs[0] : undefined;
  const declared = definition?.node.type === 'VariableDeclarator' ? unwrap(definition.node.init) : definition?.node;
  if (depth >= MAX_HELPER_DEPTH || !isFunction(declared) || declared.body === null) {
    return false;
  }
  if (declared.body.type !== 'BlockStatement') {
    return isWait(sourceCode, declared.body, depth + 1);
  }
  return declared.body.body.some((statement) => {
    if (statement.type === 'ReturnStatement') {
      return isWait(sourceCode, statement.argument, depth + 1);
    }
    const expression = statement.type === 'ExpressionStatement' ? unwrap(statement.expression) : undefined;
    return expression?.type === 'AwaitExpression' && isWait(sourceCode, expression.argument, depth + 1);
  });
}

/** Anything awaiting which only lets time or the scheduler pass: sleeps, ticks, frames, microtasks. */
export function isWait(sourceCode: SourceCode, value: Node | null | undefined, depth = 0): boolean {
  const node = unwrap(value);
  if (!node) {
    return false;
  }
  if (node.type === 'NewExpression') {
    return isScheduledPromise(sourceCode, node);
  }
  if (
    node.type === 'CallExpression' &&
    (isRealTimeWait(sourceCode, node) || isWaitHelper(sourceCode, node.callee, depth))
  ) {
    return true;
  }
  return isMicrotaskTick(sourceCode, node);
}
