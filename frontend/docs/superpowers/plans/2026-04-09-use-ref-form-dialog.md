# `useRefFormDialog` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a reusable `useRefFormDialog` hook from the duplicated state machines in `useDiagramDialogs`, fix topic creation bugs (hang, missing toasts, silent error swallowing), and render toasts above dialog overlays using a scoped Sonner Toaster.

**Architecture:** Single-dialog hook (`useRefFormDialog`) manages open/close state, submitting state, AbortController, and timeout for any dialog whose child form exposes `triggerSubmit()` via `useImperativeHandle`. A second `<Toaster>` with a unique `id` renders inside the pipeline page to ensure toasts from dialogs appear above the dialog overlay. The existing `useDiagramDialogs` hook is refactored to call the new hook twice.

**Tech Stack:** React 18.3, TypeScript, Sonner 2.x, Radix Dialog

**Spec:** `docs/superpowers/specs/2026-04-09-use-ref-form-dialog-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/hooks/use-ref-form-dialog.ts` | Create | Reusable hook: open/close, submit with abort+timeout, state |
| `src/hooks/use-ref-form-dialog.test.ts` | Create | Unit tests for the hook |
| `src/components/pages/rp-connect/pipeline/index.tsx` | Modify | Refactor `useDiagramDialogs` to use hook, add scoped Toaster, simplify dialog JSX |
| `src/react-query/api/topic.tsx` | Modify | Fix `onError` to call `toast.error()` |
| `src/components/pages/rp-connect/onboarding/add-topic-step.tsx` | Modify | Add success/select toasts |

---

### Task 1: Create `useRefFormDialog` hook

**Files:**
- Create: `src/hooks/use-ref-form-dialog.ts`

- [ ] **Step 1: Create the hook file with types and implementation**

```ts
// src/hooks/use-ref-form-dialog.ts
import type { RefObject } from 'react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

/** Minimal contract a ref-based form must satisfy. */
type RefFormSubmittable<TData> = {
  triggerSubmit: () => Promise<{ success: boolean; data?: TData }>;
};

type UseRefFormDialogOptions<TData, TTarget> = {
  ref: RefObject<RefFormSubmittable<TData> | null>;
  onSuccess: (data: TData, target: TTarget) => void;
  timeout?: number;
};

type UseRefFormDialogReturn<TTarget> = {
  isOpen: boolean;
  isSubmitting: boolean;
  target: TTarget | null;
  open: (target?: TTarget) => void;
  close: () => void;
  submit: () => Promise<void>;
};

const DEFAULT_TIMEOUT = 30_000;

function useRefFormDialog<TData, TTarget = boolean>(
  options: UseRefFormDialogOptions<TData, TTarget>,
): UseRefFormDialogReturn<TTarget> {
  const { ref, onSuccess, timeout = DEFAULT_TIMEOUT } = options;
  const [target, setTarget] = useState<TTarget | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const close = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setTarget(null);
    setIsSubmitting(false);
  }, []);

  const open = useCallback((t?: TTarget) => {
    setTarget((t ?? true) as TTarget);
  }, []);

  const submit = useCallback(async () => {
    const formRef = ref.current;
    if (!formRef || target === null || isSubmitting) {
      return;
    }

    const abort = new AbortController();
    abortRef.current = abort;
    setIsSubmitting(true);

    try {
      const result = await Promise.race([
        formRef.triggerSubmit(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('timeout')), timeout);
        }),
      ]);

      if (abort.signal.aborted) {
        return;
      }

      if (result.success && result.data) {
        onSuccess(result.data, target);
        close();
      } else {
        setIsSubmitting(false);
      }
    } catch (error) {
      if (abort.signal.aborted) {
        return;
      }
      if (error instanceof Error && error.message === 'timeout') {
        toast.error('Request timed out');
        close();
      } else {
        setIsSubmitting(false);
      }
    }
  }, [ref, target, isSubmitting, onSuccess, timeout, close]);

  return {
    isOpen: target !== null,
    isSubmitting,
    target,
    open,
    close,
    submit,
  };
}

export { useRefFormDialog };
export type { RefFormSubmittable, UseRefFormDialogOptions, UseRefFormDialogReturn };
```

- [ ] **Step 2: Verify lint and types pass**

Run: `bun run type:check && bun run lint`

- [ ] **Step 3: Commit**

```
feat: add useRefFormDialog hook

Reusable hook for dialogs with ref-based form submission.
Handles open/close, abort-on-close, and timeout.
```

---

### Task 2: Write tests for `useRefFormDialog`

**Files:**
- Create: `src/hooks/use-ref-form-dialog.test.ts`

- [ ] **Step 1: Write tests**

```ts
// src/hooks/use-ref-form-dialog.test.ts
import { act, renderHook } from '@testing-library/react';
import { type RefObject, createRef } from 'react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type RefFormSubmittable, useRefFormDialog } from './use-ref-form-dialog';

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

type TestData = { name: string };
type TestTarget = { id: number };

function createMockRef(
  triggerSubmit: () => Promise<{ success: boolean; data?: TestData }>,
): RefObject<RefFormSubmittable<TestData>> {
  const ref = createRef<RefFormSubmittable<TestData>>();
  (ref as { current: RefFormSubmittable<TestData> }).current = { triggerSubmit };
  return ref;
}

describe('useRefFormDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts closed and not submitting', () => {
    const ref = createMockRef(async () => ({ success: true }));
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useRefFormDialog<TestData, TestTarget>({ ref, onSuccess }),
    );

    expect(result.current.isOpen).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.target).toBeNull();
  });

  it('opens with target and derives isOpen', () => {
    const ref = createMockRef(async () => ({ success: true }));
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useRefFormDialog<TestData, TestTarget>({ ref, onSuccess }),
    );

    act(() => result.current.open({ id: 42 }));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.target).toEqual({ id: 42 });
  });

  it('close resets all state', () => {
    const ref = createMockRef(async () => ({ success: true }));
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useRefFormDialog<TestData, TestTarget>({ ref, onSuccess }),
    );

    act(() => result.current.open({ id: 1 }));
    act(() => result.current.close());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.target).toBeNull();
  });

  it('calls onSuccess and closes on successful submit', async () => {
    const ref = createMockRef(async () => ({
      success: true,
      data: { name: 'test' },
    }));
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useRefFormDialog<TestData, TestTarget>({ ref, onSuccess }),
    );

    act(() => result.current.open({ id: 1 }));

    await act(() => result.current.submit());

    expect(onSuccess).toHaveBeenCalledWith({ name: 'test' }, { id: 1 });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
  });

  it('keeps dialog open on failed submit', async () => {
    const ref = createMockRef(async () => ({ success: false }));
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useRefFormDialog<TestData, TestTarget>({ ref, onSuccess }),
    );

    act(() => result.current.open({ id: 1 }));

    await act(() => result.current.submit());

    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.isOpen).toBe(true);
    expect(result.current.isSubmitting).toBe(false);
  });

  it('aborts in-flight submit when close is called', async () => {
    let resolveSubmit: (v: { success: boolean; data: TestData }) => void;
    const ref = createMockRef(
      () => new Promise((resolve) => { resolveSubmit = resolve; }),
    );
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useRefFormDialog<TestData, TestTarget>({ ref, onSuccess }),
    );

    act(() => result.current.open({ id: 1 }));
    const submitPromise = act(() => result.current.submit());

    expect(result.current.isSubmitting).toBe(true);

    act(() => result.current.close());

    // Resolve after close — onSuccess should NOT be called
    resolveSubmit!({ success: true, data: { name: 'late' } });
    await submitPromise;

    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.isOpen).toBe(false);
  });

  it('shows timeout toast and closes on timeout', async () => {
    const ref = createMockRef(
      () => new Promise(() => {}), // never resolves
    );
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useRefFormDialog<TestData, TestTarget>({
        ref,
        onSuccess,
        timeout: 1000,
      }),
    );

    act(() => result.current.open({ id: 1 }));
    const submitPromise = act(() => result.current.submit());

    await act(() => vi.advanceTimersByTimeAsync(1001));
    await submitPromise;

    expect(toast.error).toHaveBeenCalledWith('Request timed out');
    expect(result.current.isOpen).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
  });

  it('does nothing when submit is called while closed', async () => {
    const triggerSubmit = vi.fn(async () => ({ success: true }));
    const ref = createMockRef(triggerSubmit);
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useRefFormDialog<TestData, TestTarget>({ ref, onSuccess }),
    );

    await act(() => result.current.submit());

    expect(triggerSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun run test:unit -- src/hooks/use-ref-form-dialog.test.ts`
Expected: All 7 tests pass.

- [ ] **Step 3: Commit**

```
test: add useRefFormDialog hook tests
```

---

### Task 3: Fix `useCreateTopicMutation` silent error swallowing

**Files:**
- Modify: `src/react-query/api/topic.tsx:129-134`

- [ ] **Step 1: Fix `onError` to call `toast.error()`**

Change lines 129-134 from:

```ts
    onError: (error) =>
      formatToastErrorMessageGRPC({
        error,
        action: 'create',
        entity: 'topic',
      }),
```

To:

```ts
    onError: (error) => {
      toast.error(
        formatToastErrorMessageGRPC({
          error,
          action: 'create',
          entity: 'topic',
        }),
      );
    },
```

This requires adding `toast` import from `sonner` at the top of the file.

- [ ] **Step 2: Verify lint and types pass**

Run: `bun run type:check && bun run lint`

- [ ] **Step 3: Commit**

```
fix: topic creation errors now show toast notification

onError was formatting the message but never displaying it.
```

---

### Task 4: Add success toasts to `AddTopicStep`

**Files:**
- Modify: `src/components/pages/rp-connect/onboarding/add-topic-step.tsx:158-225`

- [ ] **Step 1: Add `toast` import**

Add to imports at the top of the file:

```ts
import { toast } from 'sonner';
```

- [ ] **Step 2: Add toasts to `handleSubmit`**

In the `handleSubmit` callback (~line 158), add `toast.success()` calls:

For the existing topic path (line 161-166), change:

```ts
          if (existingTopicSelected) {
            return {
              success: true,
              message: `Using existing topic "${data.topicName}"`,
              data,
            };
          }
```

To:

```ts
          if (existingTopicSelected) {
            toast.success(`Using existing topic "${data.topicName}"`);
            return {
              success: true,
              message: `Using existing topic "${data.topicName}"`,
              data,
            };
          }
```

For the new topic success path (line 211-215), change:

```ts
          return {
            success: true,
            message: `Created topic "${data.topicName}" successfully!`,
            data,
          };
```

To:

```ts
          toast.success(`Created topic "${data.topicName}"`);
          return {
            success: true,
            message: `Created topic "${data.topicName}" successfully!`,
            data,
          };
```

- [ ] **Step 3: Verify lint and types pass**

Run: `bun run type:check && bun run lint`

- [ ] **Step 4: Commit**

```
feat: add success toasts to topic creation/selection

Matches existing add-user toast pattern.
```

---

### Task 5: Add scoped Toaster for pipeline dialogs

**Files:**
- Modify: `src/components/pages/rp-connect/pipeline/index.tsx`

The root `<Toaster>` renders outside the dialog portal stacking context. Add a second `<Toaster>` with a unique `id` inside the pipeline page, positioned `bottom-right`. Toasts from within dialogs will use `toast(msg, { toasterId: 'pipeline-dialog' })` — but since Sonner 2.x renders all Toasters with `z-index: 999999999` via portals, a second Toaster placed later in the DOM renders above dialog overlays.

However, the simpler approach: just add a second `<Toaster>` at the end of the pipeline page JSX with `position="bottom-right"`. All `toast()` calls broadcast to every `<Toaster>` that doesn't filter by `id`, so this will pick them up. To avoid double-rendering, we need to use `id` filtering.

**Strategy:**
1. Add `<Toaster id="pipeline" position="bottom-right" richColors />` at the end of `PipelinePage` JSX
2. In `add-topic-step.tsx` and `add-user-step.tsx`, pass `{ toasterId: 'pipeline' }` option to `toast()` calls that fire during dialog submission
3. This ensures dialog toasts render in the bottom-right Toaster that sits above the dialog overlay

- [ ] **Step 1: Add scoped Toaster to PipelinePage**

In `PipelinePage` component, add at the end of the return JSX (before the closing fragment `</>` or wrapper `</div>`):

```tsx
<Toaster id="pipeline" position="bottom-right" richColors />
```

Add the import at the top:

```ts
import { Toaster } from 'components/redpanda-ui/components/sonner';
```

- [ ] **Step 2: Scope topic toasts to pipeline Toaster**

In `src/components/pages/rp-connect/onboarding/add-topic-step.tsx`, update the toast calls added in Task 4 to include `toasterId`:

```ts
toast.success(`Using existing topic "${data.topicName}"`, { toasterId: 'pipeline' });
```

```ts
toast.success(`Created topic "${data.topicName}"`, { toasterId: 'pipeline' });
```

Also in `src/react-query/api/topic.tsx`, update the `onError` toast from Task 3:

```ts
    onError: (error) => {
      toast.error(
        formatToastErrorMessageGRPC({
          error,
          action: 'create',
          entity: 'topic',
        }),
        { toasterId: 'pipeline' },
      );
    },
```

**Note:** The `useCreateTopicMutation` is used in other places too. Since the `toasterId` only routes to a Toaster with that id, this toast will only appear when the pipeline page's Toaster is mounted. When the mutation is used elsewhere, this toast will be silently dropped. If this is a concern, omit the `toasterId` from the mutation hook and only scope the `add-topic-step.tsx` toasts. The mutation error toast will then show in both the global Toaster and the pipeline Toaster — which is acceptable since only one is typically visible at a time.

**Revised approach for `topic.tsx`:** Do NOT add `toasterId` to the mutation's `onError`. Leave it unscoped so it shows in whatever Toaster is available. Only scope the success toasts in `add-topic-step.tsx`.

- [ ] **Step 3: Scope user dialog toasts to pipeline Toaster**

In `src/components/pages/rp-connect/onboarding/add-user-step.tsx`, the toast calls at lines 272 and 297 need `toasterId: 'pipeline'`. Also need to check if `useCreateUserWithSecretsMutation` (in `src/components/pages/rp-connect/utils/user.ts`) toast calls should be scoped.

Since `add-user-step.tsx` is also used in the onboarding wizard (not just the pipeline dialog), scope only the toasts that fire from within `handleSubmit` in `add-user-step.tsx`:

Line 272: `toast.error('Service account selector not initialized', { toasterId: 'pipeline' });`
Line 297: `toast.error(formatToastErrorMessageGRPC({ error, action: 'create', entity: 'service account' }), { toasterId: 'pipeline' });`

For the `createUserWithSecrets` toasts in `utils/user.ts` — these fire from a shared utility used in both onboarding and pipeline. Do NOT scope these; they'll show in the global Toaster, which is fine.

- [ ] **Step 4: Verify lint and types pass**

Run: `bun run type:check && bun run lint`

- [ ] **Step 5: Commit**

```
feat: add scoped bottom-right Toaster for pipeline dialog toasts

Ensures dialog toasts render above the dialog overlay.
```

---

### Task 6: Refactor `useDiagramDialogs` to use `useRefFormDialog`

**Files:**
- Modify: `src/components/pages/rp-connect/pipeline/index.tsx:353-479` (hook) and ~930-1000 (dialog JSX)

- [ ] **Step 1: Define shared target type**

Add near the top of the file (after imports, before existing types):

```ts
type DiagramDialogTarget = { section: 'input' | 'output'; componentName: string };
```

- [ ] **Step 2: Rewrite `useDiagramDialogs`**

Replace the full `useDiagramDialogs` function (lines 353-479) with:

```ts
function useDiagramDialogs(yamlContent: string, handleConnectorYamlChange: (yaml: string) => void) {
  const topicStepRef = useRef<BaseStepRef<AddTopicFormData>>(null);
  const userStepRef = useRef<UserStepRef>(null);

  const topicDialog = useRefFormDialog<AddTopicFormData, DiagramDialogTarget>({
    ref: topicStepRef,
    onSuccess: (data, target) => {
      if (data.topicName) {
        const patched = tryPatchRedpandaYaml(yamlContent, target.section, target.componentName, {
          topicName: data.topicName,
        });
        if (patched) {
          handleConnectorYamlChange(patched);
        }
      }
    },
  });

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: handles service-account vs SASL branching from AddUserStep result
  const userDialog = useRefFormDialog<AddUserFormData | ServiceAccountSubmissionData, DiagramDialogTarget>({
    ref: userStepRef,
    onSuccess: (data, target) => {
      let setupResult: RedpandaSetupResultLike = {};
      if ('authMethod' in data && data.authMethod === 'service-account') {
        setupResult = {
          authMethod: 'service-account',
          serviceAccountSecretName: (data as ServiceAccountSubmissionData).serviceAccountSecretName,
        };
      } else if ('username' in data) {
        setupResult = {
          authMethod: 'sasl',
          username: (data as AddUserFormData).username,
          saslMechanism: (data as AddUserFormData).saslMechanism,
        };
      }
      const patched = tryPatchRedpandaYaml(
        yamlContent,
        target.section,
        target.componentName,
        setupResult,
      );
      if (patched) {
        handleConnectorYamlChange(patched);
      }
    },
  });

  const connectorTopics = useMemo(() => {
    if (!userDialog.target) {
      return;
    }
    return extractConnectorTopics(yamlContent, userDialog.target.section, userDialog.target.componentName);
  }, [userDialog.target, yamlContent]);

  return {
    topicDialog,
    userDialog,
    topicStepRef,
    userStepRef,
    connectorTopics,
    handleAddTopic: useCallback((section: string, componentName: string) => {
      topicDialog.open({ section: section as 'input' | 'output', componentName });
    }, [topicDialog.open]),
    handleAddSasl: useCallback((section: string, componentName: string) => {
      userDialog.open({ section: section as 'input' | 'output', componentName });
    }, [userDialog.open]),
  };
}
```

- [ ] **Step 3: Update destructured return in `PipelinePage`**

Replace the destructuring of `useDiagramDialogs` return (~line 770-784) with:

```ts
  const {
    topicDialog,
    userDialog,
    topicStepRef,
    userStepRef,
    connectorTopics,
    handleAddTopic,
    handleAddSasl,
  } = useDiagramDialogs(yamlContent, handleConnectorYamlChange);
```

- [ ] **Step 4: Update topic dialog JSX**

Replace the topic `<Dialog>` block (~line 934-960) with:

```tsx
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            topicDialog.close();
          }
        }}
        open={topicDialog.isOpen}
      >
        <DialogContent className="max-h-screen overflow-y-scroll" showCloseButton={false} size="lg">
          <DialogCloseButton />
          <DialogHeader>
            <DialogTitle>Add topic</DialogTitle>
            <DialogDescription className="mt-4">
              This component requires a Redpanda topic for logging the data. Select an existing topic, or create a new
              one.
            </DialogDescription>
          </DialogHeader>
          <AddTopicStep className="border" hideTitle ref={topicStepRef} />
          <div className="flex justify-end gap-2 pt-4">
            <Button onClick={topicDialog.close} variant="secondary-ghost">
              Cancel
            </Button>
            <Button disabled={topicDialog.isSubmitting} icon={topicDialog.isSubmitting ? <Spinner /> : undefined} onClick={topicDialog.submit}>
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 5: Update user dialog JSX**

Replace the user `<Dialog>` block (~line 962-1001) with:

```tsx
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            userDialog.close();
          }
        }}
        open={userDialog.isOpen}
      >
        <DialogContent className="max-h-screen overflow-y-scroll" showCloseButton={false} size="lg">
          <DialogCloseButton />
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription className="mt-4">
              Select or create a user for this connector. ACLs will be configured automatically for the topic when
              creating a new user.
            </DialogDescription>
          </DialogHeader>
          {connectorTopics && connectorTopics.length > 1 && (
            <Alert variant="warning">
              <AlertTitle>Multiple topics configured</AlertTitle>
              <AlertDescription>
                This connector uses multiple topics ({connectorTopics.join(', ')}). You will need to configure topic
                ACLs for this user manually in the Security settings.
              </AlertDescription>
            </Alert>
          )}
          <AddUserStep
            className="border"
            hideTitle
            ref={userStepRef}
            showConsumerGroupFields={userDialog.target?.section === 'input'}
            topicName={connectorTopics?.length === 1 ? connectorTopics[0] : undefined}
          />
          <div className="flex justify-end gap-2 pt-4">
            <Button onClick={userDialog.close} variant="secondary-ghost">
              Cancel
            </Button>
            <Button disabled={userDialog.isSubmitting} icon={userDialog.isSubmitting ? <Spinner /> : undefined} onClick={userDialog.submit}>
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 6: Clean up unused imports**

Remove any imports that are no longer needed after the refactor: `closeTopicDialog`, `closeUserDialog`, `isTopicSubmitting`, `isUserSubmitting`, `handleTopicSubmit`, `handleUserSubmit`, `topicDialogTarget`, `userDialogTarget`. Also remove the `useRefFormDialog` import if Biome didn't auto-add it — and add it if needed:

```ts
import { useRefFormDialog } from 'hooks/use-ref-form-dialog';
```

Also ensure the `ServiceAccountSubmissionData` import is present (from `../types/wizard`), and `AddUserFormData` if not already imported.

- [ ] **Step 7: Verify lint and types pass**

Run: `bun run type:check && bun run lint`

- [ ] **Step 8: Run existing tests**

Run: `bun run test:unit -- src/hooks/use-ref-form-dialog.test.ts`

- [ ] **Step 9: Commit**

```
refactor: use useRefFormDialog in useDiagramDialogs

Eliminates duplicated state machines for topic/user dialogs.
```
