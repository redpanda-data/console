import type { Reporter, TestInfo } from '@rstest/core';

import { isNonEmptyString } from '../../src/utils/string-utils';

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
      if (isNonEmptyString(process.env.CI)) {
        check(tests);
      }
    },
  };
}
