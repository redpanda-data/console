# Log Explorer BYOC Loading UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the LogExplorer loading experience for BYOC clusters where long load times cause perceived brokenness — replace ToggleGroup with Switch, tie progress bar to table content, and plan remaining backend/UX fixes.

**Architecture:** Revert the mode toggle from ToggleGroup back to a Switch with better labeling/tooltip. Move the progress indicator from below the table into a position overlaying the table top edge, making it visually tied to table content. Remove the spinner when progress data is available. Keep all changes within `log-explorer.tsx` and its test file.

**Tech Stack:** React 18.3, TanStack Table, Radix UI Switch, Tailwind CSS, Vitest + Testing Library

**Reference docs:**
- Investigation: `/Users/blair.mckee/repos/notes/plans/fix-logs.md`
- Topic messages UX: `/Users/blair.mckee/repos/notes/plans/fix-topic-messages-ux.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/ui/connect/log-explorer.tsx` | Modify | Switch toggle, progress bar overlay, loading state logic |
| `src/components/ui/connect/log-explorer.test.tsx` | Modify | Update tests for Switch, progress bar, loading states |

---

### Task 1: Replace ToggleGroup with Switch + descriptive label and tooltip

**Files:**
- Modify: `src/components/ui/connect/log-explorer.tsx:12-43` (imports), `src/components/ui/connect/log-explorer.tsx:345-377` (toolbar)
- Modify: `src/components/ui/connect/log-explorer.test.tsx:85-93` (live mode test)

- [ ] **Step 1: Update the test for live mode toggle to use a Switch instead of a radio button**

In `log-explorer.test.tsx`, the test at line 85 clicks a radio button (`getByRole('radio')`). Update it to click a switch:

```tsx
test('shows live empty state when live mode enabled and no messages', async () => {
  const user = userEvent.setup();
  renderExplorer({ enableLiveView: true });
  const liveSwitch = screen.getByTestId('log-live-toggle');
  await user.click(liveSwitch);
  expect(
    screen.getByText('Listening for new log messages\u2026 Switch to Recent Logs to view historical logs.'),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Add a test that the Switch is disabled when `enableLiveView` is false**

Add after the existing live mode test in `log-explorer.test.tsx`:

```tsx
test('live toggle is disabled when enableLiveView is false', () => {
  renderExplorer({ enableLiveView: false });
  const liveSwitch = screen.getByTestId('log-live-toggle');
  expect(liveSwitch).toBeDisabled();
});
```

- [ ] **Step 3: Add a test that the tooltip renders with max-width styling**

```tsx
test('live toggle tooltip has max-width for long content', async () => {
  const user = userEvent.setup();
  renderExplorer({ enableLiveView: true });
  const tooltipTrigger = screen.getByTestId('log-live-tooltip-trigger');
  await user.hover(tooltipTrigger);
  await waitFor(() => {
    const tooltipContent = screen.getByTestId('log-live-tooltip-content');
    expect(tooltipContent).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `bun run test:integration -- src/components/ui/connect/log-explorer.test.tsx`

Expected: 3 failures — `log-live-toggle` not found, disabled assertion fails, tooltip testid not found.

- [ ] **Step 5: Update imports in `log-explorer.tsx`**

Replace the ToggleGroup imports with Switch, Label, Tooltip, and InfoIcon. The full import block at the top of the file should change:

Remove these lines:
```tsx
import { ToggleGroup, ToggleGroupItem } from 'components/redpanda-ui/components/toggle-group';
```

Add these lines (in alphabetical order among existing imports):
```tsx
import { Label } from 'components/redpanda-ui/components/label';
import { Switch } from 'components/redpanda-ui/components/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { InfoIcon } from 'lucide-react';
```

- [ ] **Step 6: Replace the ToggleGroup toolbar markup with Switch**

Replace the toolbar section (lines 345-367) with:

```tsx
{/* Toolbar */}
<div className="flex items-center justify-between gap-2">
  <div className="flex items-center gap-3">
    <div className="flex items-center gap-2">
      <Switch
        checked={liveViewEnabled}
        className="h-5 w-9 [&_[data-slot=switch-thumb]]:size-4.5"
        data-testid="log-live-toggle"
        disabled={!enableLiveView}
        id="live-view-toggle"
        onCheckedChange={(checked) => {
          setLiveViewEnabled(checked);
          setSorting([]);
          if (checked) {
            actions.removeAllFilters();
          }
        }}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1" data-testid="log-live-tooltip-trigger">
            <Label className="cursor-pointer" htmlFor="live-view-toggle">
              {liveViewEnabled ? 'Live logs' : 'Recent logs (5h)'}
            </Label>
            <InfoIcon className="size-4 text-muted-foreground" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs" side="top" testId="log-live-tooltip-content">
          {liveViewEnabled
            ? 'Showing new log messages as they arrive in real time.'
            : 'Showing log messages from the last 5 hours. Toggle on to see live logs as they arrive.'}
        </TooltipContent>
      </Tooltip>
    </div>
    {!liveViewEnabled && (
      <DataTableFilter actions={actions} columns={filterColumns} filters={filters} table={table} />
    )}
  </div>
  <Button
    data-testid="log-refresh-button"
    disabled={isSearching}
    onClick={refresh}
    size="icon"
    variant="ghost"
  >
    <RefreshIcon className={isSearching ? 'animate-spin' : ''} />
  </Button>
</div>
```

Key changes from original Switch version:
- Switch is slightly larger via className (`h-5 w-9` vs default `h-[1.15rem] w-8`)
- Label text is dynamic and descriptive: "Live logs" when on, "Recent logs (5h)" when off
- Tooltip content has `className="max-w-xs"` for wrapping
- Tooltip content is contextual to the current mode
- `disabled={!enableLiveView}` gates the switch

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun run test:integration -- src/components/ui/connect/log-explorer.test.tsx`

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/connect/log-explorer.tsx src/components/ui/connect/log-explorer.test.tsx
git commit -m "feat(log-explorer): replace ToggleGroup with Switch + descriptive label/tooltip

Reverts to Switch control with better discoverability: dynamic label
('Live logs' / 'Recent logs (5h)'), larger switch, and tooltip with
max-width for proper text wrapping on long content."
```

---

### Task 2: Move progress bar to overlay the table top edge; make spinner and progress bar mutually exclusive

**Files:**
- Modify: `src/components/ui/connect/log-explorer.tsx:388-427` (table wrapper + loading state)
- Modify: `src/components/ui/connect/log-explorer.test.tsx:65-78` (loading tests)

- [ ] **Step 1: Update test for loading state — spinner only when no progress data**

In `log-explorer.test.tsx`, update the first loading test (line 65):

```tsx
test('shows spinner while searching with no progress data', () => {
  mockReturn.phase = 'Searching...';
  mockReturn.progress = { bytesConsumed: 0, messagesConsumed: 0 };
  renderExplorer();
  expect(screen.getByTestId('log-loading-spinner')).toBeInTheDocument();
  expect(screen.queryByTestId('log-progress-bar')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Update test for loading state — progress bar only when progress data exists (no spinner)**

Update the second loading test (line 71):

```tsx
test('shows progress bar (no spinner) when backend provides progress data', () => {
  mockReturn.phase = 'Searching...';
  mockReturn.progress = { bytesConsumed: 2_500_000, messagesConsumed: 150 };
  renderExplorer();
  expect(screen.queryByTestId('log-loading-spinner')).not.toBeInTheDocument();
  expect(screen.getByTestId('log-progress-bar')).toBeInTheDocument();
  expect(screen.getByTestId('log-search-progress')).toHaveTextContent('150 messages checked');
});
```

- [ ] **Step 3: Add a test that the progress bar renders at the top of the table container**

```tsx
test('progress bar renders above the table, not inside a table cell', () => {
  mockReturn.phase = 'Searching...';
  mockReturn.progress = { bytesConsumed: 1_000, messagesConsumed: 10 };
  renderExplorer();
  const progressBar = screen.getByTestId('log-progress-bar');
  // Progress bar should be a sibling/overlay of the table, not inside a <td>
  expect(progressBar.closest('td')).toBeNull();
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `bun run test:integration -- src/components/ui/connect/log-explorer.test.tsx`

Expected: Failures — spinner still shows with progress data, progress bar still inside `<td>`.

- [ ] **Step 5: Restructure the table wrapper to support an overlay progress bar**

In `log-explorer.tsx`, wrap the table `<div>` in a `relative` container and add the progress bar as an absolutely-positioned element at the top. Replace the current table wrapper (around line 388) and the loading state inside `<TableBody>` (around line 409).

The table wrapper becomes:

```tsx
{/* Table */}
<div className="relative min-h-0">
  {/* Progress bar overlaying top of table */}
  {isSearching && hasProgress && (
    <div className="absolute inset-x-0 top-0 z-10">
      <Progress className="h-1 w-full rounded-none" testId="log-progress-bar" value={null} />
    </div>
  )}
  <div className="overflow-auto">
    <Table>
```

Where `hasProgress` is a derived value computed before the return statement:

```tsx
const hasProgress = progress.bytesConsumed > 0 || progress.messagesConsumed > 0;
```

Move `hasProgress` out of the IIFE inside `<TableBody>` and compute it alongside `isSearching` and `filteredRowCount`.

- [ ] **Step 6: Update the loading state inside `<TableBody>` — spinner vs progress text, mutually exclusive**

Replace the loading branch inside `<TableBody>` (the `if (isSearching && messages.length === 0)` block):

```tsx
if (isSearching && messages.length === 0) {
  return (
    <TableRow>
      <TableCell className="py-10 text-center" colSpan={table.getVisibleFlatColumns().length}>
        <div className="mx-auto flex max-w-xs flex-col items-center gap-3">
          {hasProgress ? (
            <Text as="span" className="text-muted-foreground" data-testid="log-search-progress" variant="bodySmall">
              {prettyBytes(progress.bytesConsumed)} scanned, {progress.messagesConsumed.toLocaleString()} messages checked
            </Text>
          ) : (
            <Spinner className="size-6" data-testid="log-loading-spinner" />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
```

Key changes:
- Spinner and progress text are **mutually exclusive** (ternary, not both)
- The `<Progress>` bar is **not** inside the table cell — it's at the top of the table wrapper (step 5)
- When we have progress data: show the text stats + the overlay bar (no spinner)
- When we don't have progress data: show the spinner (no bar)

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun run test:integration -- src/components/ui/connect/log-explorer.test.tsx`

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/connect/log-explorer.tsx src/components/ui/connect/log-explorer.test.tsx
git commit -m "feat(log-explorer): progress bar overlays table top edge, mutually exclusive with spinner

Progress bar now renders as an absolute overlay at the top of the table
container instead of inside a table cell. Spinner only shows when the
backend hasn't provided any progress data yet. Once bytesConsumed or
messagesConsumed > 0, the progress bar + stats replace the spinner."
```

---

### Task 3: Type check and lint

**Files:**
- Modify: `src/components/ui/connect/log-explorer.tsx` (if needed)

- [ ] **Step 1: Run type checker**

Run: `bun run type:check`

Expected: No errors in `log-explorer.tsx`. Fix any that appear.

- [ ] **Step 2: Run linter**

Run: `bun run lint`

Expected: No errors. Fix any unused imports or formatting issues Biome flags.

- [ ] **Step 3: Run full test suite for this file**

Run: `bun run test:integration -- src/components/ui/connect/log-explorer.test.tsx`

Expected: All 13+ tests pass.

- [ ] **Step 4: Commit if any fixes were needed**

```bash
git add src/components/ui/connect/log-explorer.tsx src/components/ui/connect/log-explorer.test.tsx
git commit -m "fix(log-explorer): lint and type fixes"
```

---

### Task 4: Plan remaining issues (no code changes)

This task produces a plan document for the remaining issues from the investigation files. No code changes.

- [ ] **Step 1: Create the follow-up plan at `docs/superpowers/plans/2026-04-08-log-explorer-remaining-fixes.md`**

The follow-up plan should cover these items, organized by priority:

**P0 — `useLogLive` message batching (perf)**
- File: `src/react-query/api/logs.tsx` lines 230-248
- Problem: `liveReducer` creates a new array via spread on every incoming message. No throttling. At 100 msgs/sec for 60s: ~6000 array allocations with increasingly large copies.
- Fix: Add a `pendingRef` + `FLUSH_INTERVAL_MS` flush pattern matching what `useLogHistory` already does (same file, lines 174-182). Replace per-message `dispatch({ type: 'addMessage' })` with batch `dispatch({ type: 'flushMessages', msgs: [...pending] })`.
- Test gap: `useLogLive` has zero test coverage.

**P0 — Stale search results in Topic Messages viewer**
- File: `src/components/pages/topics/Tab.Messages/index.tsx:734`
- Problem: `executeMessageSearch` resolves with results but doesn't validate they match the current search params. Slow search A overwrites fast search B.
- Fix: Add `searchGenRef` generation counter; discard results from stale generations.
- Test gap: `Tab.Messages/index.tsx` (1,930 lines) has zero test coverage.

**P1 — URL state race causing phantom empty results in Topic Messages**
- File: `src/components/pages/topics/Tab.Messages/index.tsx:826-835`
- Problem: Auto-search fires 100ms after any URL param change. Two rapid param changes → two searches with partially-updated params → flash of empty results.
- Fix: Increase debounce from 100ms to 300ms.

**P1 — Toast-based progress invisible in Topic Messages**
- File: `tsx-utils.tsx` (`StatusIndicator` class component)
- Problem: Search progress renders as a toast notification, not inline. Table shows only a bare spinner.
- Fix: Render `searchPhase`, `bytesConsumed`, `totalMessagesConsumed` inline within the table loading state (same pattern as what we just did for LogExplorer).

**P2 — One-way live view sync**
- File: `src/components/ui/connect/log-explorer.tsx:212-217` (removed in current branch, but may need addressing)
- Problem: Live view doesn't auto-disable when pipeline stops. Stream stops silently.
- Fix: Show a "Pipeline stopped — switch to Recent Logs" banner when pipeline state changes to STOPPED while live mode is active.

**P2 — `useLogLive` abort/cleanup lifecycle**
- File: `src/react-query/api/logs.tsx` (live mode)
- Problem: No tests for streaming lifecycle, abort on unmount, rapid enable/disable.
- Fix: Add integration tests before making further changes.

- [ ] **Step 2: Save and commit the follow-up plan**

```bash
git add docs/superpowers/plans/2026-04-08-log-explorer-remaining-fixes.md
git commit -m "docs: add follow-up plan for remaining log explorer and topic messages fixes"
```
