---
title: Mock Patterns
impact: HIGH
impactDescription: Proper mocking prevents test pollution and enables isolated testing
tags: rstest, mocking, rs.mock, rs.mocked
---

# Mock Patterns (HIGH)

## Explanation

Proper mocking isolates tests from external dependencies. Use `rs.mock()` for module mocking and `rs.mocked()` for type-safe mock references. Mock utilities in `src/test-utils/` handle common external libraries.

## Incorrect

```typescript
// Manual mock without type safety
rs.mock('hooks/use-data');
import { useData } from 'hooks/use-data';

test('test', () => {
  (useData as any).mockReturnValue({ data: [] }); // No type safety
});
```

```typescript
// Missing mock reset between tests
rs.mock('hooks/use-data');

test('test 1', () => {
  useData.mockReturnValue({ data: [1] });
});

test('test 2', () => {
  // Still has mock from test 1!
});
```

## Correct

```typescript
// Type-safe module mocking
import { rs } from '@rstest/core';

rs.mock('hooks/use-data', () => {
  const actual = rs.requireActual<typeof import('hooks/use-data')>('hooks/use-data');
  return {
    ...actual,
    useData: rs.fn(),
  };
});

import { useData } from 'hooks/use-data';

const mockUseData = rs.mocked(useData);

describe('Component', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  test('renders with data', () => {
    mockUseData.mockReturnValue({ data: ['item'], isLoading: false });
    // Test component
  });
});
```

## Available Mock Utilities

Located in `src/test-utils/`:

| File | Purpose |
|------|---------|
| `test-utils.tsx` | Custom render with providers |
| `mock-react-select.ts` | React Select mocks |
| `mock-redpanda-ui.ts` | UI library mocks |
| `mock-lottie-react.ts` | Animation mocks |
| `mock-document.ts` | Document API mocks |
| `mock-local-storage.ts` | localStorage mocks |
| `mock-crypto.ts` | Crypto API mocks |

## Reference

- [Rstest module mocking](https://rstest.rs/guide/features/mock-modules)
