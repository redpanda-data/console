import { definePlugin } from '@oxlint/plugins';

import noHooklessUseFunction from './rules/no-hookless-use-function.ts';
import noNativeTitleTooltip from './rules/no-native-title-tooltip.ts';
import noPollingLoopInTests from './rules/no-polling-loop-in-tests.ts';
import noRealTimeWaitInTests from './rules/no-real-time-wait-in-tests.ts';
import noTestTimeoutOrUnreasonedSkip from './rules/no-test-timeout-or-unreasoned-skip.ts';
import noWallClockInTests from './rules/no-wall-clock-in-tests.ts';
import requireSuppressionReason from './rules/require-suppression-reason.ts';

export default definePlugin({
  meta: { name: 'console' },
  rules: {
    'no-hookless-use-function': noHooklessUseFunction,
    'no-native-title-tooltip': noNativeTitleTooltip,
    'no-polling-loop-in-tests': noPollingLoopInTests,
    'no-real-time-wait-in-tests': noRealTimeWaitInTests,
    'no-test-timeout-or-unreasoned-skip': noTestTimeoutOrUnreasonedSkip,
    'no-wall-clock-in-tests': noWallClockInTests,
    'require-suppression-reason': requireSuppressionReason,
  },
});
