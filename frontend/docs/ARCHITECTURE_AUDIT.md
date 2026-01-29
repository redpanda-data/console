# Pipeline Logs Architecture Audit

> **Date:** 2026-01-29
> **Status:** Fixes applied
> **Files reviewed:** `use-pipeline-log-counts.ts`, `use-pipeline-logs.ts`, `messages.tsx`, legacy `backend-api.ts`

---

## Executive Summary

We have **two parallel implementations** for pipeline logs that diverged from the legacy pattern in different ways. This audit identified critical bugs causing "moving error counts" and inconsistent log reporting, traced their root causes, and documents the fixes applied.

---

## 1. Legacy Architecture (Reference)

### Core Components

| File | Function | Role |
|------|----------|------|
| `state/backend-api.ts:2755` | `createMessageSearch()` | MobX observable for streaming messages |
| `pages/rp-connect/pipelines-details.tsx:431` | `executeMessageSearch()` | Request setup with hardcoded params |
| `pages/rp-connect/pipelines-details.tsx:280` | `LogsTab` | UI component using observable |

### Legacy Data Flow

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────┐
│  LogsTab    │────▶│ executeMessageSearch │────▶│   Backend   │
│  (MobX UI)  │     │                      │     │ ListMessages│
└─────────────┘     └──────────────────────┘     └─────────────┘
                              │
                              │  Request params:
                              │  ├── filterCode: "return key == id"
                              │  ├── maxResults: 1000
                              │  ├── startTimestamp: now - 5 hours
                              │  └── partitionId: -1 (all)
                              │
                              ▼
                    Backend streams messages
                    until maxResults or done
```

### Legacy Key Decisions

| Parameter | Value | Source |
|-----------|-------|--------|
| Time window | 5 hours | Hardcoded in `executeMessageSearch` |
| Max results | 1000 | Hardcoded in `executeMessageSearch` |
| Filter | `return key == "${pipelineId}"` | Pipeline ID only |
| Limit enforcement | **Backend** (via `maxResults` in RPC) | Server-controlled |

---

## 2. Modern Architecture - Current State

### Centralized Constants

```typescript
// react-query/api/pipeline.tsx
export const REDPANDA_CONNECT_LOGS_TOPIC = '__redpanda.connect.logs';
export const REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS = 5;

// react-query/react-query.utils.ts
export const MAX_PAGE_SIZE = 500;
```

### Two Separate Hooks

#### A. `usePipelineLogs` - Single Pipeline Detail View

**File:** `components/ui/pipeline/use-pipeline-logs.ts`

| Aspect | Value | Source |
|--------|-------|--------|
| Time window | 5 hours | `REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS` ✅ |
| Max results | 500 | `MAX_PAGE_SIZE` ✅ |
| Filter | Pipeline ID + optional levels | Server-side |
| Use case | Pipeline detail logs tab | Single pipeline |

**Verdict:** ✅ Correctly follows centralized pattern

#### B. `usePipelineLogCounts` - Pipeline List Indicators

**File:** `components/ui/pipeline/use-pipeline-log-counts.ts`

**Before fixes:**

| Aspect | Value | Source | Issue |
|--------|-------|--------|-------|
| Time window | 5 hours | `TIME_WINDOW_HOURS = 5` (local) | ❌ Duplicated |
| Per-pipeline limit | 100 | `LOGS_PER_PIPELINE = 100` (local) | ❌ Invented |
| Total max results | `N × 100` | Calculated | ❌ Arbitrary |
| Filter | Pipeline IDs only | Server-side | ❌ Missing level filter |

**After fixes:**

| Aspect | Value | Source |
|--------|-------|--------|
| Time window | 5 hours | `REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS` ✅ |
| Max results | 500 | `MAX_PAGE_SIZE` ✅ |
| Per-pipeline limit | None | Backend controls ✅ |
| Filter | Pipeline IDs + WARN/ERROR | Server-side ✅ |

---

## 3. Bugs Identified

### Bug 1: Counter Incrementing for ALL Messages

**Location:** `use-pipeline-log-counts.ts:191-195` (before fix)

```typescript
// BUG: Counter incremented BEFORE checking if WARN/ERROR
const currentCount = messageCountPerPipeline.get(pipelineId) ?? 0;
if (currentCount >= LOGS_PER_PIPELINE) {  // 100 limit
  continue;  // Skips, but INFO/DEBUG already counted!
}
messageCountPerPipeline.set(pipelineId, currentCount + 1);

// ... later ...
if (level !== 'WARN' && level !== 'ERROR') {
  continue;  // Too late - counter already incremented
}
```

**Impact:** If a pipeline produced 100 INFO logs before its first ERROR, the ERROR was never counted. This caused counts to "move around" between pipelines based on which happened to have errors early in the result window.

**Fix:** Removed arbitrary per-pipeline limit entirely. Backend controls total via `maxResults`.

### Bug 2: Backend Filter Missing Level Check

**Before:**
```typescript
const buildBatchFilter = (pipelineIds: string[]): string => {
  const idsJson = JSON.stringify(pipelineIds);
  return `return ${idsJson}.includes(key);`;  // Only checks pipeline ID
};
```

**After:**
```typescript
const buildBatchFilter = (pipelineIds: string[]): string => {
  const idsJson = JSON.stringify(pipelineIds);
  return `
    if (!${idsJson}.includes(key)) return false;
    try {
      var v = JSON.parse(content);
      var l = (v.level || '').toUpperCase();
      return l === 'WARN' || l === 'ERROR';
    } catch (e) {
      return false;
    }
  `;
};
```

**Impact:** Was fetching ALL log levels (INFO, DEBUG, TRACE) and filtering client-side, wasting bandwidth and filling `maxResults` with irrelevant messages.

### Bug 3: Constant Duplication

**Before:**
```typescript
// use-pipeline-log-counts.ts - LOCAL (wrong)
const LOGS_PER_PIPELINE = 100;
const TIME_WINDOW_HOURS = 5;
```

**After:**
```typescript
// Uses centralized imports
import { REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS, REDPANDA_CONNECT_LOGS_TOPIC } from 'react-query/api/pipeline';
import { MAX_PAGE_SIZE } from 'react-query/react-query.utils';
```

### Bug 4: Fallback Map Instability

**Before:**
```typescript
return {
  data: query.data ?? new Map<string, PipelineLogCounts>(),  // New on every render!
```

**After:**
```typescript
const EMPTY_MAP = new Map<string, PipelineLogCounts>();  // Stable reference
// ...
return {
  data: query.data ?? EMPTY_MAP,
```

---

## 4. Architecture Comparison

### Request Parameters

| Parameter | Legacy | `usePipelineLogs` | `usePipelineLogCounts` (fixed) |
|-----------|--------|-------------------|-------------------------------|
| `maxResults` | 1000 | 500 | 500 |
| Time window | 5h | 5h | 5h |
| Filter levels | None | Optional | WARN/ERROR only |
| Per-pipeline cap | None | None | None |
| Constants source | Hardcoded | Centralized | Centralized |

### Data Flow (Fixed)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Centralized Constants                        │
│  react-query/api/pipeline.tsx:                                  │
│    REDPANDA_CONNECT_LOGS_TOPIC = '__redpanda.connect.logs'     │
│    REDPANDA_CONNECT_LOGS_TIME_WINDOW_HOURS = 5                 │
│  react-query/react-query.utils.ts:                             │
│    MAX_PAGE_SIZE = 500                                          │
└─────────────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
┌─────────────────────┐       ┌─────────────────────┐
│  usePipelineLogs    │       │ usePipelineLogCounts│
│  (single pipeline)  │       │  (batch for list)   │
│                     │       │                     │
│  Filter: ID only    │       │  Filter: ID + level │
│  Levels: all/custom │       │  Levels: WARN/ERROR │
│  Use: detail view   │       │  Use: list badges   │
└─────────────────────┘       └─────────────────────┘
          │                               │
          └───────────────┬───────────────┘
                          ▼
              ┌───────────────────────┐
              │  Backend ListMessages │
              │  maxResults: 500      │
              │  (backend controls)   │
              └───────────────────────┘
```

---

## 5. Questions for Backend Team

1. **Recommended `maxResults` for log queries?**
   Currently using `MAX_PAGE_SIZE = 500`. Is this appropriate for log aggregation?

2. **Server-side aggregation endpoint?**
   Would a dedicated endpoint for log counts (returning just counts, not messages) be more efficient?

3. **Time window configuration?**
   Is 5 hours the right default? Should this be configurable server-side?

---

## 6. Future Simplification Opportunities

### Option A: Unify via `usePipelineLogs`

Use `usePipelineLogs` as single source, call N times for N pipelines:

```typescript
// For each visible pipeline
const { logs } = usePipelineLogs({ pipelineId, levels: ['WARN', 'ERROR'] });
const counts = getScopedLogIssueCounts(logs);  // Already exists
```

**Pros:** Single implementation, consistent behavior
**Cons:** N requests instead of 1 batched request

### Option B: Shared Fetching Layer

Create a shared low-level fetcher:

```typescript
// New: shared/pipeline-logs-fetcher.ts
export const fetchPipelineLogs = async (options: {
  pipelineIds: string[];
  levels?: LogLevel[];
  maxResults?: number;
}) => { /* ... */ };

// Both hooks use this internally
```

### Option C: Server-Side Aggregation (Recommended)

Request backend endpoint that returns counts directly:

```typescript
// Hypothetical API
const { data } = useQuery({
  queryKey: ['pipeline-log-counts', pipelineIds],
  queryFn: () => consoleClient.getPipelineLogCounts({ pipelineIds }),
});
```

---

## 7. Files Changed

| File | Change |
|------|--------|
| `use-pipeline-log-counts.ts` | Removed arbitrary limits, use centralized constants, server-side level filter |
| `use-pipeline-logs.ts` | No changes (already correct) |

---

## 8. Testing Checklist

- [ ] Pipeline list shows stable error/warning counts
- [ ] Counts don't "jump" between pipelines on refresh
- [ ] Counts accumulate correctly over time
- [ ] Input/output/root scoping works correctly
- [ ] Performance acceptable with many pipelines
