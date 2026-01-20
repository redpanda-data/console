---
title: Zustand Store Testing
impact: HIGH
impactDescription: Prevents state leakage between tests
tags: vitest, zustand, state, testing
---

# Zustand Store Testing (HIGH)

## Explanation

Zustand stores persist state across tests by default. Without proper mocking, tests can affect each other causing flaky failures. Always mock zustand and clear sessionStorage between tests.

## Incorrect

```typescript
// No zustand mock - state leaks between tests
import { useMyStore } from './store';

test('test 1', () => {
  const { result } = renderHook(() => useMyStore());
  act(() => result.current.setValue('test1'));
});

test('test 2', () => {
  const { result } = renderHook(() => useMyStore());
  // result.current.value might still be 'test1'!
});
```

## Correct

```typescript
import { vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMyStore } from './store';

// Enable automatic store resets
vi.mock('zustand');

describe('MyStore', () => {
  beforeEach(() => {
    // Clear persisted state
    sessionStorage.clear();
  });

  test('sets value', () => {
    const { result } = renderHook(() => useMyStore());

    act(() => {
      result.current.setValue('new value');
    });

    expect(result.current.value).toBe('new value');
  });

  test('starts fresh', () => {
    const { result } = renderHook(() => useMyStore());

    // Guaranteed to start with initial state
    expect(result.current.value).toBe(initialValue);
  });
});
```

## Store Design for Testability

```typescript
// Include reset function in store definition
const useStore = create<State>((set) => ({
  data: null,
  setData: (data) => set({ data }),
  reset: () => set({ data: null }), // Enables manual resets
}));
```

## Reference

- [Zustand Testing Guide](https://docs.pmnd.rs/zustand/guides/testing)
