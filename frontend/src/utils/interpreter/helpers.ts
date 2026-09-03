/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

const toJson = JSON.stringify;
export let successfulTests = 0;

export function expectRefEq(test: { name: string; actual: unknown; expected: unknown }) {
  const { name, actual, expected } = test;

  expect(`${name} (type equality)`, () => typeof actual === typeof expected);
  successfulTests -= 1;

  expect(`${name} (ref equality)`, () => actual === expected);
  successfulTests -= 1;

  successfulTests += 1;
}
export function expectEq(test: { name: string; actual: unknown; expected: unknown }) {
  const jActual = toJson(test.actual);
  const jExpected = toJson(test.expected);
  if (jActual === jExpected) {
    successfulTests += 1;
    return;
  }

  throw new Error(`
Test failed: ${test.name}

Actual:
    ${jActual}

Expected:
    ${jExpected}

`);
}

export function expect(test: () => boolean): void;
export function expect(name: string, test: () => boolean): void;
export function expect(testOrName: string | (() => boolean), test?: () => boolean) {
  const testFunc = typeof testOrName === 'function' ? testOrName : test;
  if (!testFunc) {
    throw new Error(`Missing test function for "${testOrName}"`);
  }

  const name = typeof testOrName === 'string' ? testOrName : null;

  if (testFunc()) {
    successfulTests += 1;
    return; // Success
  }

  // Failed!
  const failureName = name ? `: ${name}` : '';
  throw new Error(`
Test failed ${failureName}
    ${testFunc.toString()}

`);
}
