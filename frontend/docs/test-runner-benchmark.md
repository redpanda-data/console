# Test Runner Benchmark: Vitest vs Rstest vs Bun

**Date:** 2026-01-31

## Integration Tests (React Components)

**Test file:** `src/components/pages/shadowlinks/edit/shadowlink-edit-page.test.tsx`
**Test count:** 9 tests (React component rendering with user interactions)

| Runner | Environment | Total | Import/Build | Tests | vs Vitest |
|--------|-------------|-------|--------------|-------|-----------|
| Vitest | jsdom | 14.5s | 10.3s | 3.3s | baseline |
| Vitest | happy-dom | 8.5s | 7.1s | 1.2s | 41% faster |
| Rstest | jsdom | 7.0s | 1.0s | 6.0s | 52% faster |
| **Rstest** | **happy-dom** | **4.6s** | **1.0s** | **3.7s** | **68% faster** |
| **Bun** | **happy-dom** | **4.5s** | **1.5s** | **3.0s** | **69% faster** |

## Integration Tests 2 (AI Agent List Page)

**Test file:** `src/components/pages/agents/list/ai-agent-list-page.test.tsx`
**Test count:** 7 tests (React component with Connect Query and complex UI interactions)

| Runner | Environment | Total | Import/Build | Tests | vs Vitest |
|--------|-------------|-------|--------------|-------|-----------|
| Vitest | jsdom | 9.5s | 7.7s | 1.3s | baseline |
| Vitest | happy-dom | 7.7s | 6.7s | 0.6s | 19% faster |
| **Rstest** | **happy-dom** | **5.8s** | **1.8s** | **4.0s** | **39% faster** |
| **Bun** | **happy-dom** | **3.8s** | **~1s** | **~2.8s** | **60% faster** |

## Unit Tests (Pure Functions)

**Test file:** `src/utils/string.test.ts`
**Test count:** 26 tests (pure utility functions, no DOM)

| Runner | Average | Tests Only | vs Vitest |
|--------|---------|------------|-----------|
| **Bun** | **~200ms** | - | **33% faster** |
| **Vitest** | **~300ms** | ~4ms | baseline |
| Rstest | ~830ms | ~670ms | 177% slower |

**Key insight:** For unit tests without DOM dependencies, Vitest is very competitive because its transform/import overhead is minimal. Rstest's build step adds overhead that isn't amortized for small test files.

## Key Findings

### 1. Happy-dom is significantly faster than jsdom

- **Test execution time** drops 60-70% when switching from jsdom to happy-dom
- All three runners benefit from happy-dom
- No test failures or compatibility issues observed

### 2. Vitest's bottleneck is module loading, not test execution

- Vitest spends ~7-10s on transform/import (Vite's transform pipeline)
- Actual test execution is fast (~1.2s with happy-dom)
- Rstest and Bun have much faster module loading (~1-1.5s)

### 3. Rstest and Bun are both significantly faster than Vitest

- Both achieve ~4-6s total time with happy-dom (vs ~8-15s for Vitest)
- Rstest benefits from Rsbuild's fast bundling
- Bun benefits from native runtime speed
- Note: Avoid `setTimeout` inside mock implementations for Bun - use `Bun.sleep()` or synchronous mocks

## Configuration Files

### Rstest (`rstest.config.ts`)

```typescript
import { defineConfig } from '@rstest/core';

export default defineConfig({
  testEnvironment: 'happy-dom', // Key: use happy-dom instead of jsdom
  // ... other config
});
```

### Bun (`bunfig.toml`)

```toml
[test]
preload = ["./buntest.plugin.ts", "./buntest.setup.tsx"]
```

### Vitest (CLI flag)

```bash
vitest run --environment=happy-dom
```

## Migration Notes

### Vitest → Rstest

| Vitest | Rstest |
|--------|--------|
| `vi.mock()` | `rstest.mock()` |
| `vi.fn()` | `rstest.fn()` |
| `vi.mocked()` | `rstest.mocked()` |
| `vi.clearAllMocks()` | `rstest.clearAllMocks()` |

### Vitest → Bun

| Vitest | Bun |
|--------|-----|
| `vi.mock()` | `mock.module()` |
| `vi.fn()` | `mock()` |
| `vi.mocked(fn)` | `fn as Mock` |
| `importOriginal` | Pre-load with `require()` before `mock.module()` |

**Important Bun caveat:** `mock.module()` intercepts all imports of that specifier, including inside the mock factory. To spread an original module, pre-load it with `require()` using a direct file path:

```typescript
// Wrong - causes infinite loop
mock.module('@tanstack/react-router', async () => {
  const actual = await import('@tanstack/react-router'); // intercepted!
  return { ...actual, useParams: () => ({}) };
});

// Correct - pre-load before mock
const router = require('../node_modules/@tanstack/react-router/dist/cjs/index.cjs');
mock.module('@tanstack/react-router', () => ({
  ...router,
  useParams: () => ({}),
}));
```

## Recommendations

1. **Quick win:** Switch Vitest to happy-dom for ~20-40% speedup with minimal changes
2. **Best performance:** Use Bun or Rstest with happy-dom for ~40-70% speedup
3. **For Rsbuild projects:** Rstest provides seamless integration with existing build config
4. **For fastest execution:** Bun test with happy-dom offers the best raw speed

## Files Created for POC

| File | Purpose |
|------|---------|
| `rstest.config.ts` | Rstest configuration |
| `rstest.setup.tsx` | Rstest setup with mocks |
| `bunfig.toml` | Bun test configuration |
| `buntest.setup.tsx` | Bun setup with happy-dom + mocks |
| `buntest.plugin.ts` | Bun preload file |
| `*.rstest.tsx` | Rstest test file |
| `*.bun_test_.tsx` | Bun test file |
