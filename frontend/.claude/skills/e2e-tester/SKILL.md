---
name: e2e-tester
description: "Write and run Rstest/Playwright E2E tests for Redpanda Console using testcontainers. Analyzes test failures, adds missing testids, and improves test stability. Use when user requests E2E tests, Playwright tests, integration tests, test failures, missing testids, or mentions 'test workflow', 'browser testing', 'end-to-end', or 'testcontainers'."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task, mcp__ide__getDiagnostics
---

# E2E testing with Rstest, Playwright and Testcontainers

Write end-to-end tests using Playwright against a full Redpanda Console stack running in Docker containers via testcontainers.

## When to Use This Skill

- Testing 2+ step user journeys (login -> action -> verify)
- Multi-page workflows
- Browser automation with Playwright

**NOT for:** Component unit tests -> use [testing](../testing/SKILL.md)

## Critical Rules

**ALWAYS:**
- Run `bun run build` before running E2E tests (frontend assets required)
- Use `testcontainers` API for container management (never manual `docker` commands in tests)
- Use `page.getByRole()` and `page.getByLabel()` selectors (avoid CSS selectors)
- Add `data-testid` attributes when semantic selectors aren't available
- Run Rstest CLI commands and inspect `.rstest/` artifacts to analyze failures
- Clean up test data using `afterEach` to call cleanup API endpoints

**NEVER:**
- Test UI component rendering (use unit/integration tests)
- Use brittle CSS selectors like `.class-name` or `#id`
- Use `force:true` on `.click()` or `waitForTimeout`
- Hard-code wait times (use `waitFor` with conditions)
- Leave containers running after test failures
- Commit test screenshots to git

## Commands

```bash
bun run build                # Build frontend (REQUIRED first!)
bun run e2e-test:variant console  # OSS E2E
bun run e2e-test:variant console-enterprise  # Requires ENTERPRISE_BACKEND_DIR
bun run e2e-test:variant console --watch  # Rstest watcher
bun run e2e-test:variant console topics/topic-creation.spec.ts
bun run e2e-test  # All four variants, including enterprise
```

## Test Architecture

**OSS Mode (`bun run e2e-test:variant console`):** Redpanda + Backend + OwlShop containers
**Enterprise Mode (`bun run e2e-test:variant console-enterprise`):** Same + RBAC, SSO (requires `console-enterprise` repo)

File location: `tests/test-variant-<variant>/<feature>/*.spec.ts`.
Import `test`/`expect` from `tests/shared/e2e.ts` or the variant fixtures.
See [runner contracts](../../../tests/README.md).

## Selector Priority

1. `getByRole()` - Best for accessibility
2. `getByLabel()` - For form inputs
3. `getByText()` - For content verification
4. `getByTestId()` - When semantic selectors aren't clear
5. CSS selectors - Avoid if possible

## Test ID Naming

- kebab-case: `data-testid="feature-action-element"`
- Specific: include feature name + action + element type
- Dynamic: `data-testid={\`item-delete-\${id}\`}`

## References

- [Container Setup](references/container-setup.md) — Testcontainer lifecycle, configs, CI setup
- [Test Patterns](references/test-patterns.md) — Multi-step workflows, forms, tables, API testing
- [Failure Analysis](references/failure-analysis.md) — Error patterns and CLI debugging

## Output

After completing work:
1. Confirm frontend build succeeded
2. Verify all E2E tests pass
3. Note any new test IDs added to components
4. Mention cleanup of test containers
