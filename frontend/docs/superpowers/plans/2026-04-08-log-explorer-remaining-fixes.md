# Log Explorer & Topic Messages — Remaining Fixes

**Date:** 2026-04-08
**Branch:** fix/log-explorer-live-mode
**Context:** BYOC customer investigation surfaced several performance and UX issues across Log Explorer and the Topic Messages viewer. The initial investigation is documented at `/Users/blair.mckee/repos/notes/plans/fix-logs.md`; Topic Messages UX specifics are at `/Users/blair.mckee/repos/notes/plans/fix-topic-messages-ux.md`.

This document captures the remaining items that were not addressed in the initial fix pass, organized by priority.

---

## P0 — `useLogLive` message batching (performance)

**File:** `src/react-query/api/logs.tsx` lines 230–248

### Problem

`liveReducer` creates a new array via spread on every incoming message. There is no throttling. At 100 messages/second over 60 seconds this produces approximately 6,000 array allocations, each copying an increasingly large array. This will cause visible jank and steadily growing memory pressure in long-lived live-mode sessions.

### Proposed Fix

Add a `pendingRef` buffer and a `FLUSH_INTERVAL_MS` flush interval — the same pattern already used by `useLogHistory` in the same file at lines 174–182. Replace the per-message `dispatch({ type: 'addMessage' })` call with a batched `dispatch({ type: 'flushMessages', msgs: [...pending] })` that fires on the interval, then clears the buffer.

### Test Gap

`useLogLive` has zero test coverage. Tests should be added (see P2 below) before or alongside this change.

---

## P0 — Stale search results in Topic Messages viewer

**File:** `src/components/pages/topics/Tab.Messages/index.tsx:734`

### Problem

`executeMessageSearch` resolves with results but does not validate that those results match the current search parameters. If search A is slow and search B completes first, the late-arriving results from A will overwrite B's results — classic TOCTOU race. This causes incorrect data to be displayed silently.

### Proposed Fix

Add a `searchGenRef` generation counter. Increment it each time a new search is initiated. Each async search captures its generation at start; on completion it compares against the current ref and discards results if the generation has advanced. This is a standard pattern for async result invalidation.

### Test Gap

`Tab.Messages/index.tsx` is 1,930 lines with zero test coverage. A regression test for the race should be written before or as part of this change.

---

## P1 — URL state race causing phantom empty results in Topic Messages

**File:** `src/components/pages/topics/Tab.Messages/index.tsx:826–835`

### Problem

An auto-search fires 100ms after any URL parameter change. When two URL parameters change in rapid succession (e.g. topic and offset), two searches fire with partially-updated params. The first resolves with an empty or mismatched result set, producing a flash of empty results before the correct second search completes.

### Proposed Fix

Increase the debounce from 100ms to 300ms. This is a low-risk, one-line change that collapses rapid multi-param updates into a single search.

---

## P1 — Toast-based progress invisible in Topic Messages

**File:** `src/components/pages/topics/tsx-utils.tsx` (`StatusIndicator` class component)

### Problem

Search progress (phase, bytes consumed, messages consumed) is rendered as a toast notification rather than inline. While a search is running, the table shows only a bare spinner with no progress context. This is inconsistent with the inline progress pattern implemented for Log Explorer, and poor UX for long-running searches.

### Proposed Fix

Render `searchPhase`, `bytesConsumed`, and `totalMessagesConsumed` inline within the table's loading state, using the same pattern implemented for Log Explorer. The toast can remain for completion or error notifications, but in-progress state should be visible in the content area.

---

## P2 — One-way live view sync in Log Explorer

**File:** `src/components/ui/connect/log-explorer.tsx`

### Problem

When live mode is active and the underlying pipeline transitions to a STOPPED state, the live view does not detect the change. The stream stops silently — no error, no prompt to switch mode. The user sees a frozen log tail with no indication that the pipeline is no longer running.

### Proposed Fix

Subscribe to pipeline state. When the pipeline state changes to STOPPED while live mode is active, display a banner: "Pipeline stopped — switch to Recent Logs". The banner should provide a one-click action to disable live mode and load recent log history.

---

## P2 — `useLogLive` abort/cleanup lifecycle

**File:** `src/react-query/api/logs.tsx` (live mode section)

### Problem

There are no tests for the streaming lifecycle: abort on unmount, cleanup of intervals, or behavior under rapid enable/disable toggling. Making further changes to live mode (e.g. the P0 batching fix) without this coverage is risky.

### Proposed Fix

Add integration tests covering:
- Stream aborts correctly on component unmount
- Interval is cleared on unmount (no memory leak)
- Rapid toggle (enable → disable → enable) does not leave dangling subscriptions
- `pendingRef` is flushed or discarded on disable

Write tests before making further live-mode changes to establish a safety net.
