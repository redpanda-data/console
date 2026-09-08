---
name: testing
description: Write and maintain tests with Rstest dual projects, mock utilities, and Zustand store testing patterns.
---

# Testing

Write reliable tests with Rstest dual projects.

## Activation Conditions

- Writing or modifying tests
- Debugging test failures
- Setting up mocks
- Questions about test configuration

## Quick Reference

| Action | Rule |
|--------|------|
| Choose test type | `test-unit-vs-integration.md` |
| Mock modules | `test-mock-patterns.md` |
| Test stores | `test-zustand-stores.md` |
| Mock Connect APIs | `mock-transport.md` |
| Skip UI rendering tests | `no-ui-rendering-tests.md` |

## Commands

```bash
bun run test              # All tests (CI default)
bun run test:ci           # Sequential for CI
bun run test:unit         # Unit tests only
bun run test:integration  # Integration tests only
bun run test:watch        # Watch mode
bun run test:coverage     # Coverage report
```

## Key Points

- `.test.ts` = unit (Node.js), `.test.tsx` = integration (happy-dom)
- Always use `test-utils/test-utils.tsx` for React component tests
- Test that features are fully wired: UI elements must connect to actual functionality

### Feature Completeness Testing

When implementing interactive features (buttons, forms, etc.):
- Verify event handlers call the correct functions with proper parameters
- Test that AbortSignals, callbacks, and other "plumbing" are passed through
- Don't assume UI presence means functionality works - test the connection

## When to Use This Skill

- Writing `.test.ts` or `.test.tsx` files
- Mocking modules, stores, or transports
- Component behavior tests

**NOT for:** Multi-page user workflows → use [e2e-tester](../e2e-tester/SKILL.md)

## Rules

See `rules/` directory for detailed guidance.
