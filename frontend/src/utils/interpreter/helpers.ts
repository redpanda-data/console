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


export function expectRefEq(test: { name: string, actual: any, expected: any }) {
    const { name, actual, expected } = test;

    expect(`${name} (type equality)`, () => typeof actual === typeof expected);
    successfulTests--;

    expect(`${name} (ref equality)`, () => actual === expected);
    successfulTests--;

    successfulTests++;
}
export function expectEq(test: { name: string, actual: any, expected: any }) {
    const jActual = toJson(test.actual);
    const jExpected = toJson(test.expected);
    if (jActual == jExpected) {
        successfulTests++;
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
    const testFunc = typeof testOrName === 'function'
        ? testOrName as (() => boolean)
        : test!;

    const name = typeof testOrName === 'string'
        ? testOrName as string
        : null;

    if (testFunc()) {
        successfulTests++;
        return; // Success
    }

    // Failed!
    throw new Error(`
Test failed ${name ? (': ' + name) : ''}
    ${testFunc.toString()}

`);
}
