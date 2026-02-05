# Test Framework Benchmark: Vitest vs RSTest

## Overview

This document captures the benchmark results from a POC migration of the `shadowlink-edit-page.test.tsx` integration test from Vitest to RSTest.

## Baseline Metrics (Vitest)

| Metric | Value |
|--------|-------|
| Framework | Vitest 4.0.16 |
| Environment | jsdom |
| Mean execution time | 7.301s ± 0.098s |
| Min time | 7.188s |
| Max time | 7.360s |
| Status | **Test isolation issues** (fails when run individually, passes in suite) |

*Benchmarked with hyperfine (3 runs, 2 warmup runs)*

## RSTest POC Results

| Metric | Value |
|--------|-------|
| Framework | RSTest 0.8.2 |
| Environment | happy-dom |
| Status | **BLOCKED - Migration not completed** |

## Issues Encountered

### 1. Module Federation Incompatibility
RSTest adapter initially loaded the full `rsbuild.config.ts` which includes Module Federation. This caused:
- `RangeError: Invalid array length` due to large data serialization between processes
- Type generation failures

**Resolution:** Created separate `rsbuild.config.test.ts` without Module Federation.

### 2. Path Alias Mock Resolution
The codebase uses extensive TypeScript path aliases (`*` → `./src/*`) via tsconfig. RSTest's `rs.mock()` does not resolve these aliases:

```typescript
// This fails in RSTest
rs.mock('react-query/api/shadowlink', () => ({ ... }));

// This works
rs.mock('./src/react-query/api/shadowlink', () => ({ ... }));
```

However, the imports themselves still use path aliases, creating a mismatch.

### 3. Complex Dependency Graph
When importing `test-utils.tsx` (which imports the full route tree), RSTest produces `SyntaxError: Unexpected token '.'` - likely related to chunk naming or module resolution issues.

### 4. Simple Tests Pass
RSTest successfully runs:
- Basic React component tests
- `test.each()` parameterized tests
- Simple `rs.mock()` for node_modules (e.g., `sonner`)
- Protobuf imports (when test-utils not used)

## What Works in RSTest

| Feature | Status |
|---------|--------|
| React component rendering | ✅ Pass |
| @testing-library/react | ✅ Pass |
| test.each() | ✅ Pass |
| rs.mock() for npm packages | ✅ Pass |
| Protobuf imports | ✅ Pass |
| Path alias mocks | ❌ Fail |
| Complex route imports | ❌ Fail |
| Module Federation | ❌ Incompatible |

## Comparison: Cannot Complete

Since the full POC test could not be migrated, a direct performance comparison is not possible.

## Files Created

| File | Purpose |
|------|---------|
| `rstest.config.ts` | RSTest configuration |
| `rstest.setup.ts` | Test setup with browser API mocks |
| `rsbuild.config.test.ts` | Rsbuild config without Module Federation |
| `shadowlink-edit-page.rstest.tsx` | Migrated test file (incomplete) |

## Recommendations

1. **RSTest is not ready** for this codebase due to path alias limitations
2. **Wait for RSTest maturity** - path alias support in mocks is a fundamental requirement
3. **Consider alternative approaches:**
   - Use absolute paths throughout the codebase (breaking change)
   - Wait for RSTest to support mock resolution with path aliases
   - Keep using Vitest with performance optimizations

## Vitest Optimization Opportunities

Instead of migrating to RSTest, consider these Vitest optimizations:
- Use `--pool=threads` instead of `--pool=forks` for faster process creation
- Enable `--isolate=false` when test isolation isn't required
- Use `--shard` for parallel test runs in CI
- Consider `happy-dom` instead of `jsdom` (can be 2-3x faster)

## Next Steps

- [ ] File issue with RSTest about path alias support in rs.mock()
- [ ] Re-evaluate when RSTest reaches 1.0
- [ ] Consider Vitest performance optimizations as alternative
