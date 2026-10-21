---
title: Unit vs integration tests
impact: CRITICAL
tags: bun, rstest, unit, integration
---

# Classify by behavior

Use Bun (`bun:test`) for pure logic and mocked module contracts, even when the source
module uses JSX. Name those files `.test.ts`. Bun's Happy DOM preload accommodates
import-time browser reads; it is not a reason to classify a DOM journey as a unit.

Use Rstest (`@rstest/core`) for React/DOM/hooks and module-system/transport integration.
Use `.test.tsx` for JSX and `.integration.test.ts` for non-JSX integration. Keep native
CSS/input checks and full running-application journeys in `.spec.ts`, driven by Rstest's
Playwright integration. Do not replace full-stack tests with render-only fixtures.

See [frontend test guide](../../../../tests/README.md) for exact commands/configurations.
