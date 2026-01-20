---
title: Mock Patterns
impact: HIGH
impactDescription: Proper mocking prevents test pollution and enables isolated testing
tags: vitest, mocking, vi.mock, vi.mocked
---

# Mock Patterns (HIGH)

## Explanation

Proper mocking isolates tests from external dependencies. Use `vi.mock()` for module mocking and `vi.mocked()` for type-safe mock references. Mock utilities in `src/test-utils/` handle common external libraries.

## Incorrect

```typescript
// Manual mock without type safety
vi.mock('hooks/use-data');
import { useData } from 'hooks/use-data';

test('test', () => {
  (useData as any).mockReturnValue({ data: [] }); // No type safety
});
```

```typescript
// Missing mock reset between tests
vi.mock('hooks/use-data');

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
vi.mock('hooks/use-data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('hooks/use-data')>();
  return {
    ...actual,
    useData: vi.fn(),
  };
});

import { useData } from 'hooks/use-data';

const mockUseData = vi.mocked(useData);

describe('Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

- [Vitest Mocking Guide](https://vitest.dev/guide/mocking.html)
