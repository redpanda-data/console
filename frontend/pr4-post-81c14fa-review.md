# Adversarial Review: `pr4/edit-create-mode-pipeline-page` (post-81c14fa)

**Branch:** `pr4/edit-create-mode-pipeline-page` commits `9f6d47c..93ef58e` vs `81c14fa`
**Scope:** 15 files changed, +1,774 / -439 lines
**Date:** 2026-03-24

## Problem

These two commits add interactive setup-hint buttons to pipeline flow diagram leaf nodes (missing topic / SASL indicators), extract serverless initialization into a dedicated hook, decouple persisted YAML state from the pipeline diagrams UX path, add documentation links to connector nodes, and add integration tests for the rendered diagram.

## Assumptions

1. `enablePipelineDiagrams` + `isEmbedded()` is the gate for the new diagram-driven UX; when disabled the old onboarding-store persistence path is preserved.
2. `REDPANDA_TOPIC_AND_USER_COMPONENTS` exhaustively lists all components that need topic+SASL hints.
3. The `redpanda_common` component always uses `redpanda.sasl` at root level, never component-level SASL.
4. Inputs use `topics` (array), outputs use `topic` (singular) for all Redpanda components.
5. `getWizardConnectionData()` reading `sessionStorage` directly is an acceptable fallback for store hydration timing.

Correct me now or I proceed with these.

---

## Risk Analysis

### SEVERITY: HIGH

#### 1. Skip on last wizard step loses topic name from step 1

**File:** `connector-wizard.tsx:184`
**What:** The Skip button on the last step calls `onComplete({})`, discarding the `topicName` state that was saved during step 1 (ADD_TOPIC).

Old code:
```tsx
// Old handleSkip
if (isTopicStep) { methods.next(); }
else { onComplete({ topicName }); }
```

New code:
```tsx
onClick={methods.isLast ? () => onComplete({}) : methods.next}
```

**Failure mode:** User selects a Redpanda connector via the picker → completes topic step → advances to user step → clicks "Skip" → `onComplete({})` passes empty result → `applyRedpandaSetup` generates template without topic → user's topic selection is silently lost. The "Done" (submit) path correctly includes `topicName`; only "Skip" is broken.

**Blast radius:** Affects all ConnectorWizard flows for Redpanda components when the user skips the user step. Does NOT affect the diagram-hint flow (which enters at a specific step and the skip logic is the same).

**Quantified risk:** Every user who configures a topic but skips user auth (a common path — many users don't need SASL) will lose their topic config. ~50% likelihood of hitting this in normal usage.

**Recommendation:** Change line 184 to pass the topic state:
```tsx
onClick={methods.isLast ? () => onComplete({ topicName }) : methods.next}
```

---

### SEVERITY: MEDIUM

#### 2. Dialog description text is static — doesn't track step navigation

**File:** `connector-wizard.tsx:73, 143`
**What:** `isTopicStep` is computed from `initialStep` (a prop), not from the stepper's current step. The dialog description ("Select or create a topic." / "Configure user authentication.") doesn't update when the user navigates between steps.

```tsx
const isTopicStep = initialStep === RedpandaConnectorSetupStep.ADD_TOPIC;
// ... inside render prop:
<DialogDescription>
  {isTopicStep ? 'Select or create a topic.' : 'Configure user authentication.'}
</DialogDescription>
```

**Failure mode:** User starts at ADD_TOPIC, navigates to ADD_USER — description still says "Select or create a topic." Minor UX confusion; the stepper navigation and step content make the actual context clear.

**Blast radius:** Visual only, no data loss.

**Recommendation:** Move `isTopicStep` inside the render prop to use `methods.current.id`:
```tsx
{({ methods }) => {
  const isTopicStep = methods.current.id === RedpandaConnectorSetupStep.ADD_TOPIC;
  // ...
}}
```

#### 3. Create mode without serverless + diagrams enabled has no YAML restoration

**File:** `use-create-mode-initial-yaml.ts:79-85`, `index.tsx:478`
**What:** When `isPipelineDiagramsEnabled=true`:
- `handleYamlChange` does NOT persist to `useOnboardingYamlContentStore` (index.tsx:478)
- `useCreateModeInitialYaml` skips the non-serverless restoration path (line 80)

This means navigating away from create mode and returning will lose unsaved YAML content.

**Failure mode:** User in create mode (non-serverless, diagrams enabled) types YAML → navigates away → returns → editor is empty. [CONFIDENCE: MEDIUM — this may be intentional if the diagram-first UX uses a different persistence strategy, or if navigation in this flow always recreates the page]

**Blast radius:** Only affects users with `enablePipelineDiagrams` feature flag enabled in non-serverless create mode.

**Recommendation:** If intentional, add a comment explaining the design choice. If not, consider adding an alternative persistence mechanism (e.g., `sessionStorage` keyed by route).

#### 4. react-doctor `set-state-in-effect` error at `index.tsx:321`

**File:** `index.tsx:311-323`
**What:** `setYamlContent(pipeline.configYaml)` is called synchronously inside a `useEffect` body. React Compiler cannot optimize this — it triggers a cascading render.

```
react-hooks-js/set-state-in-effect (error)
Calling setState synchronously within an effect can trigger cascading renders
```

**Context:** This replaces a `queueMicrotask(() => setYamlContent(...))` that was previously used. The `queueMicrotask` approach was attempted as a fix (see `plan-react-doctor-set-state-in-effect.md`) but caused race conditions where the skeleton was removed before the editor had content.

The extracted `useCreateModeInitialYaml` hook (from `plan melodic-imagining-mitten`) solved the serverless init race condition, but this form-reset effect (which syncs pipeline query data → local YAML state for edit/view mode) still has the synchronous setState pattern.

**Why this is hard to fix:**
- YAML content has **dual ownership**: starts as server data (`pipeline.configYaml`), then becomes locally-owned (user edits). This is the classic "controlled input from server state" pattern.
- `queueMicrotask` deferral was tried → introduced a flash where skeleton was removed but editor had no content
- `useMemo`/derivation won't work because the YAML is editable after initialization
- A `key`-based remount would lose editor state (cursor position, undo history) on every pipeline refetch

**Blast radius:** Performance only — one extra render on pipeline load. No data loss or visual issues.

**Recommendation:** Accept as-is. The cascading render is bounded (fires once per pipeline load, not on every edit). Add a comment explaining why react-doctor is suppressed here. When React Compiler matures, this pattern may be auto-optimized. Alternatively, a future refactor could use an uncontrolled editor with `defaultValue` + imperative updates, but that's a larger change.

---

### SEVERITY: LOW

#### 5. `setTimeout(0)` for Monaco cursor positioning

**File:** `index.tsx:490-501`
**What:** Uses `setTimeout(0)` to defer cursor positioning after YAML content change. This is a known pattern for Monaco integration but is fragile on slow devices.

**Recommendation:** Acceptable. Document with a comment explaining why the deferral is needed.

#### 6. `getConnectorDocsUrl` hard-codes docs URL structure

**File:** `pipeline-flow-nodes.tsx:26-34`
**What:** `${DOCS_BASE}/${section}s/${connectorName}/` assumes Redpanda docs URL structure doesn't change. If docs restructure (e.g., rename `inputs` to `input`), links break silently.

**Recommendation:** Acceptable risk. External docs URLs are inherently fragile; these open in a new tab so broken links are recoverable.

#### 7. Three `biome-ignore` suppressions for cognitive complexity

**Files:** `index.tsx:186`, `pipeline-flow-nodes.tsx:120`
**What:** All suppress `noExcessiveCognitiveComplexity`. These components genuinely orchestrate complex flows.

**Recommendation:** Acceptable. The alternative (splitting into more components/functions) would increase indirection without improving clarity.

---

## Test Coverage

| Component | Lines Changed | Test File | Coverage | Gap |
|-----------|:---:|-----------|----------|-----|
| `use-create-mode-initial-yaml.ts` | 88 (new) | `.test.tsx` (245 lines) | Good | Timeout, serverless, non-serverless paths covered |
| `pipeline-flow-diagram.tsx` | +43 | `.test.tsx` (211 lines, new) | Good | 20 tests: empty/error, sections, placeholders, topics, setup hints, docs |
| `pipeline-flow-nodes.tsx` | +93 | `.test.ts` (46 lines, new) | Partial | Only `getConnectorDocsUrl` tested; node rendering covered by diagram integration tests |
| `pipeline-flow-parser.ts` | +78 | `.test.tsx` (+72 lines) | Good | 9 new tests: `missingTopic`/`missingSasl` flags, SASL detection (component + root level) |
| `yaml.ts` | +210 | `.test.tsx` (+335 lines) | Good | `patchRedpandaConfig`, `applyRedpandaSetup`, `generateYamlFromWizardData` covered |
| `connector-wizard.tsx` | DELETED | DELETED | N/A | Logic inlined into `index.tsx`; connector dialog tested via `index.test.tsx` |
| `index.tsx` | refactored | `.test.tsx` (47 lines changed) | Good | Create mode + serverless init tested |
| `add-connectors-card.tsx` | +4 | none | N/A | Additive prop only, low risk |

**Overall:** Strong test coverage for new functionality. The `pipeline-flow-nodes` rendering gap is mitigated by the diagram integration tests. No >200-line files without tests.

## Scope Creep

| File | Relation to Branch Purpose | Risk |
|------|---------------------------|------|
| `add-connectors-card.tsx` | `hideInputOutput` prop for diagram UX | LOW — additive, no signature break |
| Badge variant changes (`primary-inverted` → `info-inverted`) | Style cleanup bundled with feature | LOW — feature-scoped component |

**Verdict:** No material scope creep. All changes directly serve the diagram-interaction feature.

## Alternatives

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Surgical YAML patching (current) | Pure functions, no store side effects, works for both new + existing components | More parsing per operation | **Selected** — cleaner architecture |
| Onboarding store population (old) | Single template generation path | Store mutations as side effects, harder to test, couples wizard flow to stores | Replaced |
| Inline serverless init (old) | Fewer files | 40-line effect in already-complex component, ref flags for one-time guard | Replaced by hook |

## Summary

**PLAN SUMMARY:** Commits add interactive diagram leaf buttons for topic/SASL setup, extract serverless init to `useCreateModeInitialYaml`, and decouple YAML persistence from diagram UX. Architecture is cleaner than the pre-81c14fa approach. Test coverage is solid with ~50 new tests across 7 files.

**OUT OF SCOPE:** N/A — changes are tightly scoped.

**OPEN RISKS:** Skip-on-last-step topic loss (HIGH), static dialog description (MEDIUM).

**KNOWN UNKNOWNS:** Whether non-serverless + diagrams-enabled create mode intentionally drops YAML persistence.

## Verdict

**Fix before merge:**
- ~~**Skip topic loss** — RESOLVED: `RedpandaConnectorSetupWizard` deleted entirely. Replaced with single-purpose topic/user dialogs triggered by diagram hint buttons. No stepper = no skip state management.~~
- None remaining.

**Strongly recommended:**
- ~~**Dialog description** — RESOLVED: Stepper removed. Each dialog has its own static, correct title ("Add topic" / "Add user").~~
- **Verify Monaco sync** — manually confirm no visual flash after removing `queueMicrotask` from the form reset effect.

**Acceptable as-is:**
- react-doctor `set-state-in-effect` at line 327 — bounded cascading render on pipeline load, all alternative approaches (queueMicrotask, derivation, key-remount) have worse tradeoffs. Add explanatory comment.
- `setTimeout(0)` for Monaco cursor positioning
- `getConnectorDocsUrl` hard-coded URL structure
- `biome-ignore` cognitive complexity suppressions
- Badge variant changes
- `add-connectors-card.tsx` prop addition
- Non-serverless diagrams YAML persistence gap (if confirmed intentional)

---

**Post-review changes applied (latest commits):**
1. Deleted `connector-wizard.tsx` entirely — `RedpandaConnectorSetupWizard` and `ConnectorWizard` removed, resolves HIGH finding #1 and MEDIUM finding #2
2. Inlined connector selection into `PipelinePage` — `handleConnectorSelected` + `AddConnectorDialog` now live directly in `index.tsx`, all connectors use uniform `getConnectTemplate` flow
3. Replaced wizard with direct topic/user dialogs (`AddTopicStep` / `AddUserStep` in standalone `Dialog` components)
4. Deleted 3 dead files: `create-pipeline-sidebar.tsx`, `add-secrets-card.tsx`, `add-contextual-variables-card.tsx`
