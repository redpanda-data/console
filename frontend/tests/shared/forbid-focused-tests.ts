import type { Reporter, TestInfo } from '@rstest/core';

export function forbidFocusedTests(): Reporter {
  const check = (tests: TestInfo[]) => {
    for (const test of tests) {
      if (test.runMode === 'only') {
        throw new Error(`Focused tests are forbidden in CI: ${test.name}`);
      }
      if (test.type === 'suite') {
        check(test.tests);
      }
    }
  };
  return {
    onTestFileReady: ({ tests }) => {
      if (process.env.CI) {
        check(tests);
      }
    },
  };
}
