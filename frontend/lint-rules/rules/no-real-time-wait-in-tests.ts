import { defineRule, type ESTree } from '@oxlint/plugins';

import { type ClockKind, clockControl, clockRegion, isControlled, isTestCode } from '../test-code.ts';
import { executorSchedulerKind, isRealTimeWait, schedulerKind, settlesOnSchedule } from '../waits.ts';

const MESSAGE =
  'Real-time wait in test code: the outcome now depends on runner speed, and moving it into a helper does not change that. Await the observable milestone (`waitFor`/`findBy*`, `retryAssertion`, Playwright `expect(locator)` or `expect.poll`, an event, or a promise the test resolves), or drive the delay with fake timers (`rs.useFakeTimers()` + `rs.advanceTimersByTimeAsync()`).';

export default defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow arbitrary sleeps in tests and test helpers: Bun sleeps, `timers/promises`, `waitForTimeout`, and promises resolved by a timer, frame or tick that fake timers do not control.',
    },
    schema: [],
  },
  create(context) {
    if (!isTestCode(context.filename)) {
      return {};
    }
    const { sourceCode } = context;
    const regions: ReturnType<typeof clockRegion>[] = [];
    const scheduled: { node: ESTree.Node; kind: ClockKind }[] = [];
    return {
      CallExpression(node) {
        const kinds = clockControl(sourceCode, node);
        if (kinds) {
          regions.push(clockRegion(sourceCode, node, kinds));
        }
        if (isRealTimeWait(sourceCode, node)) {
          context.report({ node, message: MESSAGE });
          return;
        }
        const kind = schedulerKind(sourceCode, node.callee);
        if (kind && settlesOnSchedule(sourceCode, node)) {
          scheduled.push({ node, kind });
        }
      },
      NewExpression(node) {
        const kind = executorSchedulerKind(sourceCode, node);
        if (kind) {
          scheduled.push({ node, kind });
        }
      },
      // A `beforeEach` that installs fake timers may come after the wait in source order.
      'Program:exit'() {
        for (const { node, kind } of scheduled) {
          if (!isControlled(regions, node, kind)) {
            context.report({ node, message: MESSAGE });
          }
        }
      },
    };
  },
});
