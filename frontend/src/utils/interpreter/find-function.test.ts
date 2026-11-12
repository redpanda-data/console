import { build } from 'bun';

import { beforeAll, describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

let findSource = '';
let globalSource = '';

async function compileInterpreterSource(name: 'find-function.ts' | 'global.ts'): Promise<string> {
  const result = await build({
    entrypoints: [fileURLToPath(new URL(name, import.meta.url))],
    format: 'iife',
    target: 'browser',
    plugins: [
      {
        name: 'isolated-interpreter-environment',
        setup(builder) {
          builder.onResolve({ filter: /^\.\.\/env$/ }, () => ({ path: 'environment', namespace: 'interpreter-test' }));
          builder.onLoad({ filter: /.*/, namespace: 'interpreter-test' }, () => ({
            contents: 'export const IsDev = false;',
            loader: 'ts',
          }));
        },
      },
    ],
  });
  if (!result.success) {
    throw new AggregateError(result.logs, 'Interpreter source failed to bundle');
  }
  if (result.outputs.length === 0) {
    throw new Error('Interpreter bundle was not produced');
  }
  const output = result.outputs[0];
  return output.text();
}

beforeAll(async () => {
  [findSource, globalSource] = await Promise.all([
    compileInterpreterSource('find-function.ts'),
    compileInterpreterSource('global.ts'),
  ]);
});

/** Compile the actual source, but install its legacy prototype methods only in a fresh isolated realm. */
function inInterpreter(source: string): unknown {
  const context = createContext({});
  // The original TypeScript modules execute in strict mode; preserve that when evaluating an IIFE bundle.
  runInContext(`"use strict";\n${globalSource}\n${findSource}`, context);
  return runInContext(`"use strict";\n${source}`, context);
}

describe('embedded interpreter find/findAll', () => {
  test('initializes the injected payload and prototype API without mutating the host', () => {
    const hostHadFindAll = Object.hasOwn(Object.prototype, 'findAll');
    expect(inInterpreter('[value, typeof Object.prototype.find, typeof Object.prototype.findAll]')).toEqual([
      {},
      'function',
      'function',
    ]);
    expect(Object.hasOwn(Object.prototype, 'findAll')).toBe(hostHadFindAll);
  });

  test.each([
    { expression: 'false', truthy: false },
    { expression: '0', truthy: false },
    { expression: '-0', truthy: false },
    { expression: '0n', truthy: false },
    { expression: 'NaN', truthy: false },
    { expression: 'null', truthy: false },
    { expression: 'undefined', truthy: false },
    { expression: "''", truthy: false },
    { expression: '[]', truthy: true },
    { expression: '({})', truthy: true },
    { expression: '1n', truthy: true },
    { expression: "'yes'", truthy: true },
    { expression: 'new Boolean(false)', truthy: true },
  ])('preserves JS truthiness for callbacks and ignore-case arguments: $expression', ({ expression, truthy }) => {
    expect(inInterpreter(`Object.prototype.find.call({key: 'matched'}, function () {return ${expression};});`)).toBe(
      truthy ? 'matched' : undefined
    );
    expect(inInterpreter(`Object.prototype.find.call({Name: 42}, 'name', ${expression});`)).toBe(
      truthy ? 42 : undefined
    );
  });

  test('retains callback owner, currentPath and injected-root lookup', () => {
    expect(
      inInterpreter(`value = {outer: {hit: 'needle'}};
      Object.prototype.find.call(null, function (owner, key) {
        return key === 'hit' && owner.hit === 'needle' && this.currentPath.join('.') === 'outer';
      });`)
    ).toBe('needle');
  });

  test('stops at the first match without evaluating later getters', () => {
    expect(
      inInterpreter(`value = {needle: 7};
      Object.defineProperty(value, 'later', {enumerable: true, get() {throw new Error('must remain lazy');}});
      Object.prototype.find.call(null, 'needle', false);`)
    ).toBe(7);
  });

  test('treats a thrown callback as no match and continues collecting', () => {
    expect(
      inInterpreter(`Object.prototype.findAll.call({first: 1, second: 2}, function (_owner, key) {
      if (key === 'first') throw new Error('user callback failed');
      return 'truthy';
    });`)
    ).toEqual([2]);
  });

  test('keeps recursive pattern matching and case sensitivity', () => {
    expect(
      inInterpreter(`value = {items: [{kind: 'ONE'}, {kind: 'one'}, {kind: 'other'}]};
      [Object.prototype.find.call(null, {kind: 'ONE'}, false) === value.items[0],
       Object.prototype.findAll.call(null, {kind: 'ONE'}, true).length];`)
    ).toEqual([true, 2]);
  });
});
