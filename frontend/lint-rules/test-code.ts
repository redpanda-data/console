import type { ESTree, SourceCode } from '@oxlint/plugins';

import {
  contains,
  enclosingFunction,
  type FunctionNode,
  type Identifier,
  importOf,
  initializerOf,
  isGlobal,
  memberName,
  memberPath,
  type Node,
  propertyValue,
  stringValue,
  unwrap,
} from './ast.ts';

// Test code is every Console test file plus the helpers tests delegate to, so moving a wait
// into a helper does not hide it. Per-file exceptions belong in `.oxlintrc.json` overrides.
const TEST_FILE = /\.(?:cases|spec|test)\.[cm]?[jt]sx?$/u;
const HELPER_FILES = [
  /(?:^|\/)tests\/shared\//u,
  /(?:^|\/)tests\/test-variant-[^/]+\/utils\//u,
  /-test-helpers\.[cm]?[jt]sx?$/u,
];
const TEST_MODULES = new Set(['@playwright/test', '@rstest/core', 'bun:test']);
const REGISTRARS = new Set([
  'bench',
  'describe',
  'fdescribe',
  'fit',
  'it',
  'suite',
  'test',
  'xdescribe',
  'xit',
  'xtest',
]);
const HOOKS = new Set(['afterAll', 'afterEach', 'beforeAll', 'beforeEach']);
const SETUP_HOOKS = new Set(['beforeAll', 'beforeEach']);
const MOCK_OBJECTS = new Set(['jest', 'rs', 'rstest', 'vi']);
const MAX_ALIAS_DEPTH = 4;

export type ClockKind = 'date' | 'frame' | 'performance' | 'tick' | 'timer';
const FAKED_BY_DEFAULT: ClockKind[] = ['date', 'frame', 'performance', 'timer'];
const FAKEABLE: Record<string, ClockKind> = {
  Date: 'date',
  hrtime: 'performance',
  nextTick: 'tick',
  performance: 'performance',
  queueMicrotask: 'tick',
  requestAnimationFrame: 'frame',
  requestIdleCallback: 'frame',
  setImmediate: 'timer',
  setInterval: 'timer',
  setTimeout: 'timer',
};

export function isTestCode(filename: string) {
  const path = filename.replaceAll('\\', '/');
  return TEST_FILE.test(path) || HELPER_FILES.some((pattern) => pattern.test(path));
}

const isTestApiName = (name: string) => REGISTRARS.has(name) || HOOKS.has(name);

/** `const it = test` and `const test = base.extend(...)` keep the API they were made from. */
function aliasedApi(sourceCode: SourceCode, identifier: Identifier, depth: number) {
  const init = initializerOf(sourceCode, identifier);
  if (depth >= MAX_ALIAS_DEPTH || !init) {
    return;
  }
  if (init.type === 'Identifier') {
    return testApi(sourceCode, init, depth + 1);
  }
  const extended =
    init.type === 'CallExpression' && memberName(init.callee) === 'extend' ? memberPath(init.callee) : undefined;
  return extended?.path.length === 1 ? testApi(sourceCode, extended.root, depth + 1) : undefined;
}

/**
 * The test API an identifier stands for: `test`, `describe`, `beforeEach` and so on, through
 * import aliases, runtime globals, `const it = test` and `base.extend(...)` fixtures.
 */
export function testApi(sourceCode: SourceCode, identifier: Identifier, depth = 0): string | undefined {
  const binding = importOf(sourceCode, identifier);
  if (binding) {
    return isTestApiName(binding.imported) ? binding.imported : undefined;
  }
  if (isGlobal(sourceCode, identifier)) {
    return isTestApiName(identifier.name) ? identifier.name : undefined;
  }
  return aliasedApi(sourceCode, identifier, depth);
}

export type TestChain = { api: string; members: string[]; calls: ESTree.CallExpression[] };

/** `a.b(x).c` as its root, the member names in order, and the curried calls from the outside in. */
function flattenCallee(callee: Node) {
  const members: string[] = [];
  const calls: ESTree.CallExpression[] = [];
  let current = unwrap(callee);
  while (current?.type === 'MemberExpression' || current?.type === 'CallExpression') {
    if (current.type === 'CallExpression') {
      calls.push(current);
    } else {
      members.unshift(memberName(current) ?? '');
    }
    current = unwrap(current.type === 'CallExpression' ? current.callee : current.object);
  }
  return { root: current?.type === 'Identifier' ? current : undefined, members, calls };
}

/** Flattens `test.describe.skipIf(x)(name, fn)` into its API, member names and curried calls. */
export function testChain(sourceCode: SourceCode, callee: Node): TestChain | undefined {
  const { root, members, calls } = flattenCallee(callee);
  const namespace = root && importOf(sourceCode, root);
  if (namespace?.imported === '*' && TEST_MODULES.has(namespace.source)) {
    const [api = '', ...rest] = members;
    return isTestApiName(api) ? { api, members: rest, calls } : undefined;
  }
  const api = root && testApi(sourceCode, root);
  return api ? { api, members, calls } : undefined;
}

export const isHook = (name: string) => HOOKS.has(name);

/** `bunTest.jest` off a namespace import of a test module. */
function namespacedExport(sourceCode: SourceCode, member: ESTree.MemberExpression) {
  const object = unwrap(member.object);
  const namespace = object?.type === 'Identifier' ? importOf(sourceCode, object) : undefined;
  const name = memberName(member);
  const isNamespace = namespace?.imported === '*' && TEST_MODULES.has(namespace.source);
  return isNamespace && name ? { source: namespace.source, name } : undefined;
}

/**
 * The test-module export a reference names (`rs`, `jest`, `setSystemTime` and so on) through
 * named-import aliases, namespace imports such as `bunTest.jest`, or the runtime's globals.
 */
function testModuleExport(sourceCode: SourceCode, node: Node | null | undefined) {
  const target = unwrap(node);
  if (target?.type === 'MemberExpression') {
    return namespacedExport(sourceCode, target);
  }
  if (target?.type !== 'Identifier') {
    return;
  }
  const binding = importOf(sourceCode, target);
  if (binding) {
    return TEST_MODULES.has(binding.source) ? { source: binding.source, name: binding.imported } : undefined;
  }
  return isGlobal(sourceCode, target) ? { source: undefined, name: target.name } : undefined;
}

/** `rs`/`rstest` from Rstest or `jest`/`vi` from Bun. */
export function isMockObject(sourceCode: SourceCode, node: Node | null | undefined) {
  const exported = testModuleExport(sourceCode, node);
  return exported !== undefined && MOCK_OBJECTS.has(exported.name);
}

/** A `bun:test` export such as `setSystemTime`, `mock` or `spyOn`. */
export function isBunExport(sourceCode: SourceCode, node: Node | null | undefined, name: string) {
  const exported = testModuleExport(sourceCode, node);
  return exported?.source === 'bun:test' && exported.name === name;
}

function clockKinds(node: Node | undefined) {
  const target = unwrap(node);
  if (target?.type !== 'ArrayExpression') {
    return;
  }
  return target.elements.flatMap((element) => {
    const kind = FAKEABLE[stringValue(element) ?? ''];
    return kind ? [kind] : [];
  });
}

/** What `useFakeTimers(options)` fakes; Rstest's default fakes everything but ticks. */
function fakedBy(options: Node | undefined): Set<ClockKind> {
  const kinds = new Set(clockKinds(propertyValue(options, 'toFake')) ?? FAKED_BY_DEFAULT);
  for (const kind of clockKinds(propertyValue(options, 'toNotFake')) ?? []) {
    kinds.delete(kind);
  }
  return kinds;
}

/** The clocks a call takes control of, if it installs fake timers or pins the system time. */
export function clockControl(sourceCode: SourceCode, call: ESTree.CallExpression): Set<ClockKind> | undefined {
  const callee = unwrap(call.callee);
  if (call.arguments.length > 0 && isBunExport(sourceCode, callee, 'setSystemTime')) {
    return new Set(['date']);
  }
  if (callee?.type !== 'MemberExpression' || !isMockObject(sourceCode, callee.object)) {
    return;
  }
  const method = memberName(callee);
  if (method === 'useFakeTimers') {
    return fakedBy(call.arguments[0]);
  }
  return method === 'setSystemTime' && call.arguments.length > 0 ? new Set(['date']) : undefined;
}

/** The `beforeEach`/`beforeAll` call that registers `fn`, if any; `after*` hooks run too late. */
function setupHookRegistration(sourceCode: SourceCode, fn: FunctionNode | ESTree.Program) {
  const { parent } = fn;
  if (parent?.type !== 'CallExpression' || !parent.arguments.some((argument) => argument === fn)) {
    return;
  }
  const chain = testChain(sourceCode, parent.callee);
  const name = chain?.members.at(-1) ?? chain?.api;
  return name && SETUP_HOOKS.has(name) ? parent : undefined;
}

export type ClockRegion = {
  kinds: Set<ClockKind>;
  owner: FunctionNode | ESTree.Program;
  viaHook: boolean;
  start: number;
};

/**
 * Where a clock control is in effect: after the call within the test or function it runs in,
 * or, from a `beforeEach`/`beforeAll`, inside the tests and hooks registered beside that hook.
 * Calls through helper functions are not followed.
 */
export function clockRegion(sourceCode: SourceCode, call: ESTree.CallExpression, kinds: Set<ClockKind>): ClockRegion {
  const fn = enclosingFunction(call) ?? sourceCode.ast;
  const hook = setupHookRegistration(sourceCode, fn);
  const owner = hook ? (enclosingFunction(hook) ?? sourceCode.ast) : fn;
  return { kinds, owner, viaHook: hook !== undefined, start: call.range[0] };
}

export function isControlled(regions: ClockRegion[], node: Node, kind: ClockKind) {
  return regions.some((region) => {
    if (!(region.kinds.has(kind) && contains(region.owner, node))) {
      return false;
    }
    // Code directly in the registering body runs while tests are collected, before any hook.
    return region.viaHook ? enclosingFunction(node) !== region.owner : region.start < node.range[0];
  });
}
