import { expect, test } from 'bun:test';
import { devDependencies } from '../package.json' with { type: 'json' };

const EXACT_VERSION = /^\d+\.\d+\.\d+$/u;

test('pins the pre-1.0 Rstest runner and its coverage adapter to the same release', () => {
  expect(devDependencies['@rstest/core']).toMatch(EXACT_VERSION);
  expect(devDependencies['@rstest/coverage-v8']).toBe(devDependencies['@rstest/core']);
  expect(devDependencies['@module-federation/rstest']).toMatch(EXACT_VERSION);
});
