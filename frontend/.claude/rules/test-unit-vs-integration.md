---
paths:
  - "src/**/*.test.{ts,tsx}"
---

# Test classification

Classify what the test exercises before choosing its filename:

- Pure logic/mocked module contracts: `.test.ts`, Bun (`bun run test:unit`).
- React, DOM, hooks, state/transport integration: `.test.tsx`, Rstest + Happy DOM.
- Configuration/subprocess integration: `.integration.test.ts`, Rstest.
- Native browser and full running-app journeys: `.spec.ts`, Rstest + Playwright.

See [test guide](../../tests/README.md) for commands and fixtures. Keep full-stack journeys on Testcontainers; mocked bundle tests do not replace them.
