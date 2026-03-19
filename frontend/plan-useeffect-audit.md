# Plan: useEffect Audit — `pipeline/` directory

## Audit Results

6 useEffect/useLayoutEffect calls found across 2 files. 3 are clean, 3 need fixes.

### Clean (no changes needed)

| File                        | Line | Purpose                                            | Why OK                                                      |
| --------------------------- | ---- | -------------------------------------------------- | ----------------------------------------------------------- |
| `pipeline-flow-diagram.tsx` | 138  | `useLayoutEffect` — measure container before paint | Mount-only DOM sync (Rule 4)                                |
| `pipeline-flow-diagram.tsx` | 149  | `useEffect` — ResizeObserver for container         | Mount-only external system (Rule 4)                         |
| `index.tsx`                 | 189  | `useEffect` — Cmd+Shift+P keyboard shortcut        | DOM event listener, re-subscribes on `mode` change (Rule 4) |

### Needs Fix

#### 1. `index.tsx:265` — Form initialization from pipeline data

**Deps:** `[pipeline, mode, form]`
**Violation:** Rule 1 (derive state, don't sync it) + Rule 5 (reset with key)

```tsx
useEffect(() => {
  if (pipeline && mode !== 'create') {
    form.reset({ ... });
    queueMicrotask(() => setYamlContent(pipeline.configYaml));
  }
}, [pipeline, mode, form]);
```

**Problem:** Syncs form state from pipeline prop via effect. The `queueMicrotask` is a timing workaround smell.

**Fix:** Use `defaultValues` option with react-hook-form's async values pattern. `useForm` supports a `values` option that auto-resets when the value changes — no effect needed:

```tsx
const form = useForm<PipelineFormValues>({
  resolver: zodResolver(pipelineFormSchema),
  mode: "onChange",
  values:
    pipeline && mode !== "create"
      ? {
          name: pipeline.displayName,
          description: pipeline.description || "",
          computeUnits: cpuToTasks(pipeline.resources?.cpuShares) || MIN_TASKS,
          tags: Object.entries(pipeline.tags)
            .filter(([k]) => !isSystemTag(k))
            .map(([key, value]) => ({ key, value })),
        }
      : undefined,
  defaultValues: {
    name: "",
    description: "",
    computeUnits: MIN_TASKS,
    tags: [],
  },
});
```

For `yamlContent`: derive initial value from pipeline instead of syncing via effect. Use `useState` initializer or adjust-state-during-render pattern:

```tsx
const [yamlContent, setYamlContent] = useState("");
const [prevPipelineId, setPrevPipelineId] = useState<string | undefined>();
if (pipeline && pipeline.id !== prevPipelineId) {
  setPrevPipelineId(pipeline.id);
  if (mode !== "create") {
    setYamlContent(pipeline.configYaml);
  }
}
```

This eliminates the effect and the `queueMicrotask` hack.

#### 2. `index.tsx:281` — Load persisted YAML from Zustand (CREATE mode)

**Deps:** `[mode, persistedYamlContent]`
**Violation:** Rule 5 (choreography via ref flag)

```tsx
const hasLoadedPersistedYaml = useRef(false);
useEffect(() => {
  if (
    mode === "create" &&
    persistedYamlContent &&
    !hasLoadedPersistedYaml.current
  ) {
    hasLoadedPersistedYaml.current = true;
    queueMicrotask(() => setYamlContent(persistedYamlContent));
  }
}, [mode, persistedYamlContent]);
```

**Problem:** Ref flag prevents re-initialization — dependency choreography. Another `queueMicrotask` smell.

**Fix:** Use adjust-state-during-render. The persisted YAML should seed `yamlContent` on first render in create mode:

```tsx
const [hasLoadedPersistedYaml, setHasLoadedPersistedYaml] = useState(false);
if (mode === "create" && persistedYamlContent && !hasLoadedPersistedYaml) {
  setHasLoadedPersistedYaml(true);
  setYamlContent(persistedYamlContent);
}
```

No effect, no `queueMicrotask`, no ref. React handles the synchronous state update during render.

#### 3. `index.tsx:290` — Serverless mode YAML generation

**Deps:** `[components]`
**Violation:** Rule 5 (choreography via ref flag)

```tsx
// biome-ignore lint/correctness/useExhaustiveDependencies
useEffect(() => {
  if (
    mode !== "create" ||
    !isServerlessMode ||
    hasInitializedServerless.current ||
    components.length === 0
  )
    return;
  // ... generate YAML from wizard data ...
  hasInitializedServerless.current = true;
}, [components]);
```

**Problem:** Ref flag gate, suppressed exhaustive-deps lint, reads mode/isServerlessMode without declaring them as deps.

**Fix:** Same adjust-state-during-render pattern:

```tsx
const [hasInitializedServerless, setHasInitializedServerless] = useState(false);
if (
  mode === "create" &&
  isServerlessMode &&
  !hasInitializedServerless &&
  components.length > 0
) {
  setHasInitializedServerless(true);
  // ... generate YAML from wizard data and call setYamlContent ...
}
```

Removes the biome-ignore suppression and makes all dependencies explicit.

## Implementation Order

1. Fix #2 (persisted YAML) — simplest, direct ref→state conversion
2. Fix #3 (serverless init) — similar pattern, slightly more logic
3. Fix #1 (form init) — most involved, needs react-hook-form `values` option + yamlContent derivation

## Resolved Questions

**Q: Does `useForm({ values })` auto-reset dirty fields?**
A: Yes — react-hook-form's `values` option resets the entire form when the object reference changes (shallow compare). It behaves like calling `form.reset(newValues)` automatically. To verify before shipping: write a quick integration test that sets `values`, dirties a field, then changes `values` — assert the dirty field resets. If it doesn't behave as expected, fallback: keep `form.reset()` but in adjust-state-during-render instead of useEffect.

**Q: What does "ordering" mean for fix #3 feeding into fix #2?**
A: Currently fix #3 (serverless init) writes generated YAML to `useOnboardingYamlContentStore`, and fix #2 reads `persistedYamlContent` from that same store. With the old useEffect approach, #3's effect runs first (writes to store), then #2's effect reads it on the next render. With adjust-state-during-render, both run synchronously in the same render pass — but since #3 writes to a Zustand store (external, not React state), #2 won't see the update until the *next* render when the Zustand selector re-evaluates. So the ordering is fine — no change needed. The Zustand subscription triggers a re-render, and on that re-render #2's guard (`persistedYamlContent && !hasLoaded`) fires correctly.
