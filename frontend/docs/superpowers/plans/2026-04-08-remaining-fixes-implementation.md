# Remaining Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix stale search results, URL debounce, inline progress in Topic Messages; add pipeline-stopped banner in Log Explorer.

**Architecture:** P0 `useLogLive` batching is already implemented (pendingRef + flushMessages pattern at logs.tsx:372-385) — skip it. Focus on: (1) searchGenRef guard in Tab.Messages to prevent stale results, (2) debounce increase 100ms→300ms, (3) inline progress polling during search via interval reading `currentMessageSearchRef.current.bytesConsumed/totalMessagesConsumed`, (4) pipeline-stopped banner in log-explorer.

**Tech Stack:** React 18.3, Vitest + Testing Library, TanStack Table

**Note:** P0 `useLogLive` batching is already implemented. P2 `useLogLive` abort/cleanup tests are deferred — they need a dedicated test infrastructure effort and aren't blocking.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/pages/topics/Tab.Messages/index.tsx` | Modify | Stale result guard, debounce increase, inline progress |
| `src/components/ui/connect/log-explorer.tsx` | Modify | Pipeline-stopped banner |
| `src/components/ui/connect/log-explorer.test.tsx` | Modify | Banner test |

---

### Task 1: Stale search result guard in Tab.Messages

**Files:**
- Modify: `src/components/pages/topics/Tab.Messages/index.tsx:558-559` (add ref), `index.tsx:785-806` (searchFunc), `index.tsx:720-742` (executeMessageSearch result handler)

- [ ] **Step 1: Add `searchGenRef` alongside existing refs**

At line 558 (next to `currentSearchRunRef` and `abortControllerRef`), add:

```tsx
const searchGenRef = useRef(0);
```

- [ ] **Step 2: Increment the generation in `searchFunc` when starting a new search**

In `searchFunc` (line 768), immediately after the dedup check at line 776, increment the generation. Insert after line 785 (`currentSearchRunRef.current = searchParams;`):

```tsx
searchGenRef.current += 1;
```

- [ ] **Step 3: Capture generation in `executeMessageSearch` and guard result-setting**

In `executeMessageSearch` (line 664), capture the current generation at the start of the function body (after the filter code construction, before the search starts — around line 717):

```tsx
const searchGen = searchGenRef.current;
```

Then at line 734, wrap the result-setting block in a generation check:

```tsx
if (searchGen !== searchGenRef.current) {
  // Stale result from a superseded search — discard
  return result;
}
setSearchState((prev) => ({ ...prev, messages: result, windowStartPage: 0 }));
```

The full block from line 733 to ~745 becomes:

```tsx
const endTime = Date.now();

if (searchGen !== searchGenRef.current) {
  return result;
}

setSearchState((prev) => ({ ...prev, messages: result, windowStartPage: 0 }));
windowStartPageRef.current = 0;
if (maxResults < pageSize) {
  lastLoadMoreRef.current = { pageIndex: 0, total: result.length };
}
setSearchPhase(null);
setElapsedMs(() => endTime - startTime);
setBytesConsumed(search.bytesConsumed);
setTotalMessagesConsumed(search.totalMessagesConsumed);
```

- [ ] **Step 4: Add `searchGenRef` to `executeMessageSearch`'s useCallback dependency array**

The `executeMessageSearch` useCallback at line 664 has a dependency array ending around line 765. `searchGenRef` is a ref so it doesn't need to be in the dependency array — refs are stable. No change needed here.

- [ ] **Step 5: Verify types and run type check**

Run: `bun run type:check`

Expected: No errors.

---

### Task 2: Increase auto-search debounce from 100ms to 300ms

**Files:**
- Modify: `src/components/pages/topics/Tab.Messages/index.tsx:830`

- [ ] **Step 1: Change the debounce timeout**

At line 830, change:

```tsx
const timer = setTimeout(() => {
  searchFunc('auto');
}, 100);
```

To:

```tsx
const timer = setTimeout(() => {
  searchFunc('auto');
}, 300);
```

- [ ] **Step 2: Run type check**

Run: `bun run type:check`

Expected: No errors.

---

### Task 3: Inline search progress in Tab.Messages table loading state

**Files:**
- Modify: `src/components/pages/topics/Tab.Messages/index.tsx:1716-1723` (loading state in table body)

The `createMessageSearch` object updates `bytesConsumed` and `totalMessagesConsumed` during streaming (backend-api.ts:2853-2854). These are already tracked in state at lines 547-548, but only set AFTER search completes (line 741-742). To show live progress during search, we need to poll the search object via an interval.

- [ ] **Step 1: Add a progress-polling effect that reads from `currentMessageSearchRef` during search**

Add a new effect after the `currentMessageSearchRef` sync effect (after line 599). This polls the search object for live progress while `searchPhase` is active:

```tsx
// Poll search object for live progress during streaming
useEffect(() => {
  if (searchPhase === null) {
    return;
  }
  const interval = setInterval(() => {
    const search = currentMessageSearchRef.current;
    if (search) {
      setBytesConsumed(search.bytesConsumed);
      setTotalMessagesConsumed(search.totalMessagesConsumed);
    }
  }, 200);
  return () => clearInterval(interval);
}, [searchPhase]);
```

- [ ] **Step 2: Update the table loading state to show inline progress**

Replace the loading branch at lines 1716-1723:

```tsx
if (searchPhase !== null && filteredMessages.length === 0) {
  return (
    <TableRow>
      <TableCell className="py-10 text-center" colSpan={table.getVisibleFlatColumns().length}>
        <Spinner size="md" />
      </TableCell>
    </TableRow>
  );
}
```

With:

```tsx
if (searchPhase !== null && filteredMessages.length === 0) {
  const hasProgress = bytesConsumed > 0 || totalMessagesConsumed > 0;
  return (
    <TableRow>
      <TableCell className="py-10 text-center" colSpan={table.getVisibleFlatColumns().length}>
        <div className="mx-auto flex max-w-xs flex-col items-center gap-3">
          {hasProgress ? (
            <span className="text-sm text-muted-foreground">
              {prettyBytes(bytesConsumed)} scanned, {totalMessagesConsumed.toLocaleString()} messages checked
            </span>
          ) : (
            <Spinner size="md" />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
```

- [ ] **Step 3: Run type check**

Run: `bun run type:check`

Expected: No errors.

---

### Task 4: Pipeline-stopped banner in Log Explorer

**Files:**
- Modify: `src/components/ui/connect/log-explorer.tsx:209` (component body)
- Modify: `src/components/ui/connect/log-explorer.test.tsx` (add banner test)

- [ ] **Step 1: Add test for pipeline-stopped banner**

In `log-explorer.test.tsx`, add after the existing tests:

```tsx
test('shows pipeline-stopped banner when live mode is on and pipeline is not running', () => {
  const stoppedPipeline = { id: 'pipeline-1', displayName: 'Test Pipeline', state: 4 } as unknown as Pipeline;
  renderExplorer({ pipeline: stoppedPipeline, enableLiveView: true });
  // Banner should not show initially (live mode is off by default)
  expect(screen.queryByTestId('pipeline-stopped-banner')).not.toBeInTheDocument();
});

test('shows pipeline-stopped banner after enabling live mode on stopped pipeline', async () => {
  const stoppedPipeline = { id: 'pipeline-1', displayName: 'Test Pipeline', state: 4 } as unknown as Pipeline;
  const user = userEvent.setup();
  renderExplorer({ pipeline: stoppedPipeline, enableLiveView: true });
  const liveSwitch = screen.getByTestId('log-live-toggle');
  await user.click(liveSwitch);
  expect(screen.getByTestId('pipeline-stopped-banner')).toBeInTheDocument();
  expect(screen.getByText(/pipeline is not running/i)).toBeInTheDocument();
});
```

Also add the `Pipeline_State` import to the test file's type import for `Pipeline`:

The test file already imports `Pipeline` as `unknown as Pipeline` — the `state` field is just a number on the enum, so passing `state: 4` (STOPPED) works.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:integration -- src/components/ui/connect/log-explorer.test.tsx`

Expected: 1 failure — `pipeline-stopped-banner` testid not found after clicking switch.

- [ ] **Step 3: Add the Pipeline_State import and banner logic**

In `log-explorer.tsx`, add the import:

```tsx
import { Pipeline_State } from '../../../protogen/redpanda/api/dataplane/v1/pipeline_pb';
```

Then inside the component body (after `const hasProgress = ...` around line 342), add:

```tsx
const pipelineNotRunning = pipeline.state !== Pipeline_State.RUNNING && pipeline.state !== Pipeline_State.STARTING;
```

Then in the JSX, between the `{/* Error */}` alert and the `{/* Table */}` section, add:

```tsx
{/* Pipeline stopped banner */}
{liveViewEnabled && pipelineNotRunning && (
  <Alert data-testid="pipeline-stopped-banner" variant="default">
    <AlertTitle>Pipeline is not running</AlertTitle>
    <AlertDescription>
      Live logs require a running pipeline.{' '}
      <button
        className="underline font-medium"
        onClick={() => {
          setLiveViewEnabled(false);
        }}
        type="button"
      >
        Switch to Recent Logs
      </button>{' '}
      to view historical logs.
    </AlertDescription>
  </Alert>
)}
```

Note: `Alert`, `AlertTitle`, and `AlertDescription` are already imported in the file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:integration -- src/components/ui/connect/log-explorer.test.tsx`

Expected: All tests pass.

- [ ] **Step 5: Run type check and lint**

Run: `bun run type:check && bun run lint`

Expected: No errors.

---

### Task 5: Final verification

- [ ] **Step 1: Run type check**

Run: `bun run type:check`

- [ ] **Step 2: Run lint**

Run: `bun run lint`

- [ ] **Step 3: Run all affected test files**

Run: `bun run test:integration -- src/components/ui/connect/log-explorer.test.tsx`

Expected: All tests pass.
