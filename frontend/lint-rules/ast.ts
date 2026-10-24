import type { ESTree, SourceCode, Variable } from '@oxlint/plugins';

export type Node = ESTree.Node;
export type FunctionNode = ESTree.Function | ESTree.ArrowFunctionExpression;
type Wrapper =
  | ESTree.ChainExpression
  | ESTree.ParenthesizedExpression
  | ESTree.TSAsExpression
  | ESTree.TSInstantiationExpression
  | ESTree.TSNonNullExpression
  | ESTree.TSSatisfiesExpression
  | ESTree.TSTypeAssertion;
export type Identifier = Extract<Node, { type: 'Identifier' }>;
type NamedIdentifier = { type: string; name: string } & Node;

const WRAPPERS = new Set([
  'ChainExpression',
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSInstantiationExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
]);
const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression']);
const GLOBAL_OBJECTS = new Set(['global', 'globalThis', 'self', 'window']);

export function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string';
}

export function isFunction(node: Node | null | undefined): node is FunctionNode {
  return node !== null && node !== undefined && FUNCTIONS.has(node.type);
}

function isWrapper(node: Node): node is Wrapper {
  return WRAPPERS.has(node.type);
}

/** Strips parentheses, optional chains and type-only wrappers. */
export function unwrap(node: Node | null | undefined): Node | undefined {
  let current = node ?? undefined;
  while (current && isWrapper(current)) {
    current = current.expression;
  }
  return current;
}

export function isIdentifier(node: Node | null | undefined, name?: string): node is Identifier {
  const target = unwrap(node);
  return target?.type === 'Identifier' && (name === undefined || target.name === name);
}

/** The text of a string literal or an interpolation-free template literal. */
export function stringValue(node: Node | null | undefined): string | undefined {
  const target = unwrap(node);
  if (target?.type === 'Literal' && typeof target.value === 'string') {
    return target.value;
  }
  if (target?.type === 'TemplateLiteral' && target.expressions.length === 0) {
    return target.quasis[0]?.value.cooked ?? undefined;
  }
}

/** The static key of an object property or pattern entry: `{ key }`, `{ 'key': x }`, not `{ [key]: x }`. */
export function propertyKey(node: Node | null | undefined): string | undefined {
  if (node?.type !== 'Property') {
    return;
  }
  if (!node.computed && node.key.type === 'Identifier') {
    return node.key.name;
  }
  return stringValue(node.key);
}

/** The value of `key` in an object literal, if it is written statically. */
export function propertyValue(node: Node | null | undefined, key: string) {
  const target = unwrap(node);
  if (target?.type !== 'ObjectExpression') {
    return;
  }
  const property = target.properties.find((entry) => propertyKey(entry) === key);
  return property?.type === 'Property' ? property.value : undefined;
}

/** The static name of a member property; computed keys only count when they are string literals. */
export function memberName(node: Node | null | undefined): string | undefined {
  const target = unwrap(node);
  if (target?.type !== 'MemberExpression') {
    return;
  }
  if (target.computed) {
    return stringValue(target.property);
  }
  return target.property.type === 'Identifier' ? target.property.name : undefined;
}

/** `a.b.c` as `[a, ['b', 'c']]`, looking through wrappers; undefined for dynamic keys or call links. */
export function memberPath(node: Node | null | undefined): { root: Identifier; path: string[] } | undefined {
  const target = unwrap(node);
  if (isIdentifier(target)) {
    return { root: target, path: [] };
  }
  const name = memberName(target);
  if (target?.type !== 'MemberExpression' || name === undefined) {
    return;
  }
  const object = memberPath(target.object);
  return object && { root: object.root, path: [...object.path, name] };
}

export function findVariable(sourceCode: SourceCode, identifier: NamedIdentifier): Variable | undefined {
  let scope: ReturnType<SourceCode['getScope']> | null = sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.set.get(identifier.name);
    if (variable) {
      return variable;
    }
    scope = scope.upper;
  }
}

/** True when the name is not declared by the file, so it refers to the runtime global. */
export function isGlobal(sourceCode: SourceCode, identifier: NamedIdentifier) {
  const variable = findVariable(sourceCode, identifier);
  return variable === undefined || variable.defs.length === 0;
}

/** The module and exported name an identifier was imported as; `*` for namespace imports. */
export function importOf(sourceCode: SourceCode, identifier: NamedIdentifier) {
  const definition = findVariable(sourceCode, identifier)?.defs[0];
  if (definition?.type !== 'ImportBinding' || definition.parent?.type !== 'ImportDeclaration') {
    return;
  }
  const specifier = definition.node;
  let imported = '*';
  if (specifier.type === 'ImportSpecifier') {
    imported = specifier.imported.type === 'Identifier' ? specifier.imported.name : String(specifier.imported.value);
  } else if (specifier.type === 'ImportDefaultSpecifier') {
    imported = 'default';
  }
  return { source: definition.parent.source.value, imported };
}

/** The initializer of a `const name = init` binding, when that is how the name was declared. */
export function initializerOf(sourceCode: SourceCode, identifier: NamedIdentifier): Node | undefined {
  const definition = findVariable(sourceCode, identifier)?.defs[0];
  if (definition?.type !== 'Variable' || definition.node.type !== 'VariableDeclarator') {
    return;
  }
  return unwrap(definition.node.init);
}

/** `globalThis.Date.now` and `Date.now` name the same thing when `globalThis` is the global. */
export function globalPath(sourceCode: SourceCode, node: Node | null | undefined): string | undefined {
  const member = memberPath(node);
  if (!(member && isGlobal(sourceCode, member.root))) {
    return;
  }
  const names = [member.root.name, ...member.path];
  while (names.length > 1 && GLOBAL_OBJECTS.has(names[0] ?? '')) {
    names.shift();
  }
  return names.join('.');
}

function children(node: Node): unknown[] {
  return Object.entries(node).flatMap(([key, value]) => (key === 'parent' ? [] : [value]));
}

/** Depth-first search that does not enter nested functions, which run on their own schedule. */
export function someInRun(value: unknown, match: (node: Node) => boolean, root?: Node): boolean {
  if (Array.isArray(value)) {
    return value.some((child) => someInRun(child, match, root));
  }
  if (!isNode(value)) {
    return false;
  }
  if (value !== root && isFunction(value)) {
    return false;
  }
  return match(value) || children(value).some((child) => someInRun(child, match, root));
}

export function enclosingFunction(node: Node): FunctionNode | ESTree.Program | undefined {
  let current = node.parent;
  while (current && !isFunction(current) && current.type !== 'Program') {
    current = current.parent;
  }
  return current ?? undefined;
}

export function contains(outer: Node, inner: Node) {
  return outer.range[0] <= inner.range[0] && inner.range[1] <= outer.range[1];
}
