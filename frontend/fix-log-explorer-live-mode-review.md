# Adversarial Review: `fix/log-explorer-live-mode`

**Branch:** `fix/log-explorer-live-mode` vs `master`
**Scope:** 12 files changed (staged), +1294 / -47 lines (3 source files committed, 9 additional files staged but uncommitted)
**Date:** 2026-04-08

## Problem

BYOC clusters have slow log loading, causing perceived brokenness. This branch aims to: (1) improve LogExplorer loading UX with progress bar + spinner/progress mutual exclusivity, (2) replace Switch with ToggleGroup then back to Switch with better labeling, (3) add pipeline-stopped banner, (4) add `useLogLive` message batching to fix O(n^2) array allocations, (5) fix stale search results and inline progress in Topic Messages viewer, and (6) improve pipeline user ACL dialog with topic extraction and field renaming.

## Assumptions

1. The "full delta" for review is committed changes + staged changes combined (since git status shows staged modifications not yet committed).
2. The committed code (`c5480f06c`) is an intermediate state that will be squashed or amended — the staged changes revert/improve upon it.
3. `enableLiveView` is only passed from one caller (`pipeline/index.tsx:491`) where it's set based on pipeline state being RUNNING.
4. The 4 plan docs under `docs/superpowers/plans/` are intended for commit.
5. The pipeline user ACL changes (superuser rename, topic extraction) are intentionally bundled into this branch.

Correct me now or I proceed with these.

## Risk Analysis

### SEVERITY: HIGH

#### 1. `extractConnectorTopics` never detects input topics — `Array.isArray` fails on YAMLSeq
**File:** `src/components/pages/rp-connect/utils/yaml.ts:750-756`
**What:** `doc.getIn(['input', componentName, 'topics'])` returns a `YAMLSeq` node (yaml v2.8.1), not a plain JS array. `Array.isArray(yamlSeqNode)` returns `false`. Verified empirically:
```
> const result = doc.getIn(['input', 'redpanda_common', 'topics']);
> Array.isArray(result) → false
> result.constructor.name → 'YAMLSeq'
```
**Failure mode:** For input connectors, `topics` (plural) is never extracted. Falls through to check `topic` (singular), which inputs don't have. Returns `undefined`. `AddUserStep` receives `topicName={undefined}` — no ACL auto-configuration for input connectors.
**Blast radius:** All input connector user creation dialogs in the pipeline sidebar. ACLs won't be configured automatically for inputs.
**Quantified risk:** 100% failure for input connectors with `topics: [...]` (which is all of them).
**Recommendation:** Call `.toJSON()` on the node before the Array.isArray check:
```tsx
const topicsRaw = doc.getIn([section, componentName, 'topics']);
const topics = topicsRaw && typeof topicsRaw === 'object' && 'toJSON' in topicsRaw
  ? topicsRaw.toJSON()
  : topicsRaw;
if (Array.isArray(topics)) { ... }
```
Or use `doc.toJS()` and navigate the plain object.

#### 2. `pipelineNotRunning` fires on UNSPECIFIED state — false positive banner
**File:** `src/components/ui/connect/log-explorer.tsx:343`
**What:** `pipeline.state !== Pipeline_State.RUNNING && pipeline.state !== Pipeline_State.STARTING` evaluates to `true` when `pipeline.state` is `0` (UNSPECIFIED), which is the protobuf default when state hasn't been populated.
**Failure mode:** If the pipeline object is loaded before state is populated (e.g., initial render, partial fetch), the "Pipeline is not running" banner appears spuriously when a user enables live mode.
**Blast radius:** LogExplorer only. Banner flashes then disappears once state populates.
**Quantified risk:** Depends on how quickly pipeline state resolves. If the parent component fetches pipeline in a single query where state is always present, risk is low. If there's a loading state where `pipeline` exists but `state` is UNSPECIFIED, this fires. [CONFIDENCE: MEDIUM — need to verify the Pipeline query shape]
**Recommendation:** Add `Pipeline_State.UNSPECIFIED` to the allowlist, or invert the logic:
```tsx
const pipelineNotRunning = pipeline.state === Pipeline_State.STOPPED
  || pipeline.state === Pipeline_State.ERROR;
```

#### 3. Removal of `enableLiveView` sync pattern — behavioral change for callers
**File:** `src/components/ui/connect/log-explorer.tsx:209`
**What:** Master initializes `liveViewEnabled` from `enableLiveView` prop and syncs when the prop changes (lines 211-219). Branch initializes to `false` always and removes the sync.
**Failure mode:** The sole caller (`pipeline/index.tsx:491`) passes `enableLiveView={pipeline.state === Pipeline_State.RUNNING}`. On master, when a pipeline transitions to RUNNING, the sync pattern auto-enables live mode. On branch, the user must manually toggle.
**Blast radius:** LogExplorer behavior when pipeline state changes. Users on BYOC clusters (the target audience) won't get auto-live-mode when pipeline starts.
**Quantified risk:** 100% behavior change for the auto-enable-on-running flow. Whether this is intentional or not is unclear — the plan doesn't discuss it.
**Recommendation:** Confirm this is intended. If auto-enable was causing UX issues (the "perceived brokenness" in the problem statement), document the decision. If not, restore the sync pattern but only for the `false → true` transition.

### SEVERITY: MEDIUM

#### 4. `stripCommentedKeys` regex is section-unaware
**File:** `src/components/pages/rp-connect/utils/yaml.ts:664-672`
**What:** The regex `^(\s*)#\s*(?:topic|topics|sasl):.*$\n?` matches any commented line containing those keys, regardless of which YAML section it's in.
**Failure mode:** If a multi-section YAML has `# topics: Required - ...` comments in both input and output sections, patching the output removes the comment from the input section too.
**Blast radius:** YAML editing for connectors with placeholder comments. Visual only — no data loss, but confusing.
**Quantified risk:** Low frequency (most pipelines have 1-2 sections), low impact (cosmetic).
**Recommendation:** Accept as-is, but consider scoping the regex to only strip comments near the patched section if this causes user confusion.

#### 5. Tab.Messages `searchGenRef` — no test coverage for the stale result guard
**File:** `src/components/pages/topics/Tab.Messages/index.tsx:732-753`
**What:** The stale search result guard is the P0 fix in the plan, protecting against race conditions. There are zero tests for it.
**Failure mode:** If the guard is accidentally removed or the logic is wrong, stale results overwrite correct results silently.
**Blast radius:** Topic Messages viewer — core data display for all topics.
**Quantified risk:** The implementation looks correct (capture gen at start, compare at end). Risk is future regression without test coverage.
**Recommendation:** Strongly recommend adding a test before merge. The race can be simulated by mocking `createMessageSearch` to resolve in controlled order.

#### 6. Tab.Messages `prettyBytes` — import may be missing
**File:** `src/components/pages/topics/Tab.Messages/index.tsx:1742`
**What:** The inline progress uses `prettyBytes(bytesConsumed)` but I need to verify `prettyBytes` is imported in this file.
**Quantified risk:** If missing, TypeScript will catch it. [CONFIDENCE: MEDIUM — not verified]
**Recommendation:** Run `bun run type:check` to confirm.

#### 7. Progress bar UX — indeterminate progress may confuse users
**File:** `src/components/ui/connect/log-explorer.tsx:429`
**What:** `<Progress value={null} />` renders an indeterminate (pulsing) progress bar. Combined with "X scanned, Y messages checked" text, users may expect a deterministic progress indicator.
**Blast radius:** LogExplorer loading UX only. Cosmetic.
**Recommendation:** Accept as-is. True progress percentage isn't available without knowing total partition size. The indeterminate bar + stats text is a reasonable compromise.

### SEVERITY: LOW

#### 8. Scope creep — pipeline user ACL changes bundled with log explorer fixes
**Files:** `add-user-step.tsx`, `wizard.ts`, `user.ts`, `yaml.ts`, `pipeline/index.tsx`
**What:** The branch `fix/log-explorer-live-mode` bundles 3 distinct feature areas: (1) log explorer loading UX, (2) stale search/inline progress in Topic Messages, (3) pipeline user ACL improvements. These have zero code overlap.
**Risk:** Rollback of log explorer changes also reverts the ACL improvements. Merge conflicts more likely across 12 files than 3.
**Recommendation:** Strongly recommend splitting into 2-3 PRs: log explorer UX, Tab.Messages fixes, pipeline ACL improvements. Each has its own plan doc already, making the split clean.

#### 9. Plan docs contain local filesystem paths
**Files:** `docs/superpowers/plans/2026-04-08-log-explorer-byoc-loading-ux.md:12-13`, `2026-04-08-log-explorer-remaining-fixes.md:5`
**What:** Plans reference `/Users/blair.mckee/repos/notes/plans/fix-logs.md` — a local path that doesn't exist for other developers.
**Recommendation:** Remove or replace with relative repo paths before committing.

#### 10. Committed code is an abandoned intermediate state
**What:** The single commit `c5480f06c feat: attempt 1` introduces ToggleGroup, but the staged changes immediately revert to Switch. The commit message provides no context. If bisecting, this commit is a red herring.
**Recommendation:** Squash/amend before PR so the commit history reflects the actual intended changes, not the journey.

#### 11. `RefreshCcw` → `RefreshIcon` import swap
**File:** `src/components/ui/connect/log-explorer.tsx:46`
**What:** Master uses `RefreshCcw` from `lucide-react`, branch uses `RefreshIcon` from `components/icons`. Both render a refresh icon. Minor visual difference possible.
**Recommendation:** Accept. Using the project's icon set (`components/icons`) is more consistent.

## Test Coverage

| Component | Lines Changed | Test File | Coverage | Gap |
|-----------|--------------|-----------|----------|-----|
| `log-explorer.tsx` | ~96 | `log-explorer.test.tsx` | ~70% | No test for pipeline-stopped banner *dismissal* (clicking "Switch to Recent Logs"). No test for progress bar + messages simultaneously (search phase with existing messages). |
| `log-explorer.test.tsx` | ~55 | — | N/A | Tests are well-structured. 18 tests passing. |
| `logs.tsx` | ~77 | none | 0% | `useLogLive` batching (flushMessages, pendingRef) has zero tests. `useLogHistory` progress tracking has zero tests. **This is the riskiest untested code on the branch.** |
| `Tab.Messages/index.tsx` | ~40 | none | 0% | Stale result guard, debounce change, inline progress — all untested. File is 1,930 lines with zero test coverage overall. |
| `yaml.ts` (`extractConnectorTopics`) | ~35 | none | 0% | New function with YAML parsing + branching. Has a confirmed bug (HIGH #1). No tests. |
| `yaml.ts` (`stripCommentedKeys`) | ~10 | none | 0% | Regex-based comment removal. No tests. |
| `pipeline/index.tsx` | ~36 | none | 0% | Dialog changes, topic extraction, multi-topic alert — untested. |
| `add-user-step.tsx` | ~4 | none | 0% | Field rename only — low risk. |
| `wizard.ts` | ~2 | none | 0% | Schema rename only — low risk. |
| `user.ts` | ~2 | none | 0% | Condition rename only — low risk. |

**Overall:** ~30% of changed lines have direct test coverage. The highest-risk changes (batching in `logs.tsx`, stale guard in `Tab.Messages`) have 0%.

## Scope Creep

| Change | Related to branch purpose? | Risk |
|--------|---------------------------|------|
| `add-user-step.tsx` — superuser→grantTopicPermissions | No | LOW — rename only, but blocks clean rollback |
| `wizard.ts` — schema rename | No | LOW |
| `user.ts` — ACL condition rename | No | LOW |
| `yaml.ts` — `extractConnectorTopics` + `stripCommentedKeys` | No | MEDIUM — new functions with a confirmed bug |
| `pipeline/index.tsx` — topic extraction, dialog UX | No | MEDIUM — new feature bundled with bug fix |
| `Tab.Messages/index.tsx` — stale guard, debounce, progress | Tangentially (same problem domain, different component) | MEDIUM — high-risk changes to 1,930-line file with 0 tests |
| Plan docs (4 files) | No (documentation, not code) | LOW |

**5 tangential source files, mixed risk. Recommend splitting into separate PRs.**

## Alternatives

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Ship as one PR | Single review cycle, faster to merge | Rollback couples unrelated features, 12 files across 3 domains | Not recommended |
| Split into 3 PRs (log explorer, Tab.Messages, pipeline ACL) | Clean rollback per feature, focused review, matches plan docs 1:1 | More PRs to manage | **Recommended** |
| Ship log explorer only, defer rest | Addresses the BYOC customer issue immediately | Delays P0 stale result fix and ACL improvements | Acceptable compromise |

## Summary

**PLAN SUMMARY:** Three of four plan docs are partially or fully implemented. The BYOC loading UX plan is the most complete. The remaining-fixes plan (Tab.Messages) is partially done (stale guard + debounce + inline progress, but no pipeline-stopped banner in this file). The pipeline-user-ACL plan is fully implemented but has a bug.

**OUT OF SCOPE:** The `useLogLive` abort/cleanup tests (P2 in the remaining-fixes plan) are correctly deferred.

**OPEN RISKS:**
- `extractConnectorTopics` silently fails for all input connectors (confirmed bug)
- `pipelineNotRunning` may false-positive on UNSPECIFIED state
- `enableLiveView` initial state behavioral change — intentional?
- Zero test coverage for the two highest-risk data layer changes (`logs.tsx` batching, `Tab.Messages` stale guard)

**KNOWN UNKNOWNS:**
- Whether `Pipeline` objects can have state=UNSPECIFIED in the actual data flow
- Whether the `enableLiveView` auto-enable removal was an intentional UX decision or oversight

## Verdict

**Fix before merge:**
1. **HIGH #1**: Fix `extractConnectorTopics` — call `.toJSON()` on the YAMLSeq node before `Array.isArray` check. This is a guaranteed bug.
2. **HIGH #3**: Confirm whether removing the `enableLiveView` sync pattern is intentional. If not, restore it.

**Strongly recommended:**
3. **HIGH #2**: Guard against `Pipeline_State.UNSPECIFIED` in the `pipelineNotRunning` check.
4. **MEDIUM #5**: Add at least one test for the `searchGenRef` stale result guard.
5. **LOW #8**: Split into separate PRs per feature domain.
6. **LOW #10**: Squash the "attempt 1" commit before PR.
7. **LOW #9**: Remove local filesystem paths from plan docs.

**Acceptable as-is:**
8. **MEDIUM #4**: `stripCommentedKeys` section-unawareness (cosmetic, low frequency).
9. **MEDIUM #7**: Indeterminate progress bar UX.
10. **LOW #11**: RefreshIcon swap.
