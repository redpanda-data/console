import { defineRule, type ESTree, type SourceCode } from '@oxlint/plugins';

import { globalPath, isGlobal, memberName, memberPath, type Node, unwrap } from '../ast.ts';
import {
  type ClockKind,
  type ClockRegion,
  clockControl,
  clockRegion,
  isBunExport,
  isControlled,
  isMockObject,
  isTestCode,
} from '../test-code.ts';

const READINGS: Record<string, ClockKind> = {
  'Bun.nanoseconds': 'performance',
  'Date.now': 'date',
  'performance.now': 'performance',
  'process.hrtime': 'performance',
  'process.hrtime.bigint': 'performance',
};
const MOCK_FACTORIES = new Set(['doMock', 'fn', 'mock', 'setSystemTime', 'spyOn', 'stubGlobal']);
const MOCK_RESULTS = new Set([
  'mockImplementation',
  'mockImplementationOnce',
  'mockRejectedValue',
  'mockRejectedValueOnce',
  'mockResolvedValue',
  'mockResolvedValueOnce',
  'mockReturnValue',
  'mockReturnValueOnce',
]);
const BUN_MOCKS = ['mock', 'setSystemTime', 'spyOn'];
const MESSAGE =
  'Wall-clock reading in test code: values and elapsed-time assertions change with the run. Pin the clock (`rs.setSystemTime`/`rs.useFakeTimers` in the test or a `beforeEach`, Bun `setSystemTime`), use a fixed date, or `crypto.randomUUID()` for unique names. A full-stack check that needs real broker time can suppress this line with a reason.';

/** Calls whose arguments seed a mock or a fake clock rather than measure the run. */
function isMockSetup(sourceCode: SourceCode, call: ESTree.CallExpression) {
  const callee = unwrap(call.callee);
  if (BUN_MOCKS.some((name) => isBunExport(sourceCode, callee, name))) {
    return true;
  }
  if (callee?.type !== 'MemberExpression') {
    return false;
  }
  const method = memberName(callee) ?? '';
  if (MOCK_RESULTS.has(method) || memberPath(callee)?.path.at(-2) === 'clock') {
    return true;
  }
  return (
    (MOCK_FACTORIES.has(method) && isMockObject(sourceCode, callee.object)) ||
    (method === 'module' && isBunExport(sourceCode, callee.object, 'mock'))
  );
}

function feedsMock(sourceCode: SourceCode, node: Node) {
  let child = node;
  let current = node.parent;
  while (current) {
    if (current.type === 'CallExpression' && current.callee !== child && isMockSetup(sourceCode, current)) {
      return true;
    }
    child = current;
    current = current.parent;
  }
  return false;
}

/** `Date()` without `new` also returns the current time, as a string. */
function readingKind(sourceCode: SourceCode, node: ESTree.CallExpression | ESTree.NewExpression) {
  const callee = unwrap(node.callee);
  if (callee?.type === 'Identifier' && callee.name === 'Date' && isGlobal(sourceCode, callee)) {
    return node.type === 'CallExpression' || node.arguments.length === 0 ? 'date' : undefined;
  }
  const path = node.type === 'CallExpression' ? globalPath(sourceCode, callee) : undefined;
  return path === undefined ? undefined : READINGS[path];
}

export default defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow `Date.now()`, `new Date()`, `performance.now()` and `process.hrtime()` in tests and test helpers unless a fake clock covers them or they seed a mock.',
    },
    schema: [],
  },
  create(context) {
    if (!isTestCode(context.filename)) {
      return {};
    }
    const { sourceCode } = context;
    const regions: ClockRegion[] = [];
    const readings: { node: Node; kind: ClockKind }[] = [];
    const record = (node: ESTree.CallExpression | ESTree.NewExpression) => {
      const kind = readingKind(sourceCode, node);
      if (kind && !feedsMock(sourceCode, node)) {
        readings.push({ node, kind });
      }
    };
    return {
      CallExpression(node) {
        const kinds = clockControl(sourceCode, node);
        if (kinds) {
          regions.push(clockRegion(sourceCode, node, kinds));
        }
        record(node);
      },
      NewExpression: record,
      'Program:exit'() {
        for (const { node, kind } of readings) {
          if (!isControlled(regions, node, kind)) {
            context.report({ node, message: MESSAGE });
          }
        }
      },
    };
  },
});
