---
title: Unit vs Integration Tests
impact: CRITICAL
impactDescription: Wrong file extension causes tests to run in wrong environment
tags: rstest, unit, integration, configuration
---

# Unit vs Integration Tests (CRITICAL)

## Explanation

Rstest uses separate unit and integration projects. File extension determines environment:
- `.test.ts` runs in Node.js (fast, no DOM)
- `.test.tsx` runs in happy-dom (browser-like, slower)

Using wrong extension causes environment mismatches and test failures.

## Incorrect

```typescript
// src/utils/format.test.tsx - WRONG extension for pure logic
import { formatDate } from './format';

test('formats date', () => {
  expect(formatDate(new Date())).toBe('...');
});
```

```typescript
// src/components/Button.test.ts - WRONG extension for React
import { render } from 'test-utils/test-utils';
import { Button } from './Button';

test('renders button', () => {
  render(<Button>Click</Button>); // Fails: no DOM
});
```

## Correct

```typescript
// src/utils/format.test.ts - Correct for pure logic
import { formatDate } from './format';

test('formats date', () => {
  expect(formatDate(new Date())).toBe('...');
});
```

```typescript
// src/components/Button.test.tsx - Correct for React
import { render, screen } from 'test-utils/test-utils';
import { Button } from './Button';

test('renders button', () => {
  render(<Button>Click</Button>);
  expect(screen.getByRole('button')).toBeInTheDocument();
});
```

## Decision Guide

| Test Type | Extension | Environment | Use For |
|-----------|-----------|-------------|---------|
| Unit | `.test.ts` | Node.js | Utilities, helpers, pure functions |
| Integration | `.test.tsx` | happy-dom | React components, hooks with DOM |

## Reference

- `rstest.config.unit.ts` - Unit test project
- `rstest.config.integration.ts` - Integration test project
- `rstest.config.ts` - Multi-project watch configuration
