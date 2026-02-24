---
paths:
  - "src/**/*.test.{ts,tsx}"
---

# Unit vs Integration Tests

| Extension | Environment | Use For |
|-----------|-------------|---------|
| `.test.ts` | Node (no DOM) | Pure logic, utils, transforms |
| `.test.tsx` | JSDOM (browser) | Components, hooks, DOM interaction |

Wrong extension = test silently passes or fails in CI. See [full rule](../skills/testing/rules/test-unit-vs-integration.md) for details.
