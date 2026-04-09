# `useRefFormDialog` Hook Design

## Problem

`useDiagramDialogs` in `pipeline/index.tsx` duplicates the same state machine twice (topic + user): open/close state, submitting state, AbortController ref, close-with-abort cleanup, and submit-with-abort-check logic. This pattern will recur for any dialog that wraps a child form exposed via `useImperativeHandle` + `BaseStepRef`.

Additionally, topic creation has bugs: indefinite hangs when `onSuccess` awaits stalled queries, missing success toasts, and a silently swallowed `onError`.

## Scope

- New `useRefFormDialog` hook for ref-based form dialogs
- Refactor `useDiagramDialogs` to use the hook (eliminates duplicated state machines)
- Fix topic creation hang (timeout in hook + mutation `onError` fix)
- Add success toast to topic creation (matching user creation pattern)

## Hook API

```ts
// src/hooks/use-ref-form-dialog.ts

type RefFormSubmittable<TData> = {
  triggerSubmit: () => Promise<{ success: boolean; data?: TData }>;
};

type UseRefFormDialogOptions<TData, TTarget> = {
  ref: RefObject<RefFormSubmittable<TData> | null>;
  onSuccess: (data: TData, target: TTarget) => void;
  timeout?: number; // default 30_000ms
};

type UseRefFormDialogReturn<TTarget> = {
  isOpen: boolean;
  isSubmitting: boolean;
  target: TTarget | null;
  open: (target?: TTarget) => void;
  close: () => void;
  submit: () => Promise<void>;
};

function useRefFormDialog<TData, TTarget = boolean>(
  options: UseRefFormDialogOptions<TData, TTarget>
): UseRefFormDialogReturn<TTarget>;
```

### Generics

- `TData` — form result type (e.g. `AddTopicFormData`)
- `TTarget` — open payload type (e.g. `{ section: 'input' | 'output'; componentName: string }`). Defaults to `boolean` for simple open/closed dialogs.

### Ref contract

The hook accepts any ref matching `RefFormSubmittable<TData>` — a subset of `BaseStepRef`. This avoids coupling the hook to the wizard types. Both `BaseStepRef<T>` and `UserStepRef` satisfy this interface.

## Internal Behavior

### `open(target)`

- Sets `target` state. Defaults to `true` when called with no argument (for simple dialogs).
- `isOpen` is derived: `target !== null`.

### `submit()`

1. Early return if no ref, no target, or already submitting.
2. Create new `AbortController`, store in a ref.
3. `setIsSubmitting(true)`.
4. Race `ref.triggerSubmit()` against timeout via `Promise.race`.
5. **If aborted** (close was called during submission) — return silently, cleanup already done by `close()`.
6. **If timed out** — call `close()`, show `toast.error('Request timed out')`.
7. **If `result.success && result.data`** — call `onSuccess(data, target)`, then `close()`.
8. **If `!result.success`** — `setIsSubmitting(false)`, keep dialog open for user to retry or fix validation errors.

### `close()`

1. Abort current controller (if any).
2. Null out controller ref.
3. `setTarget(null)`.
4. `setIsSubmitting(false)`.

### Key behavior: failure keeps dialog open

A failed submission (validation error, server error caught by the form) keeps the dialog open so the user can retry. Only success, explicit close, or timeout dismisses it.

## Consumer Usage

### `useDiagramDialogs` after refactor

```ts
type DiagramDialogTarget = { section: 'input' | 'output'; componentName: string };

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
        if (patched) handleConnectorYamlChange(patched);
      }
    },
  });

  const userDialog = useRefFormDialog<UserStepFormData, DiagramDialogTarget>({
    ref: userStepRef,
    onSuccess: (data, target) => {
      let setupResult: RedpandaSetupResultLike = {};
      if ('authMethod' in data && data.authMethod === 'service-account') {
        setupResult = {
          authMethod: 'service-account',
          serviceAccountSecretName: data.serviceAccountSecretName,
        };
      } else if ('username' in data) {
        setupResult = {
          authMethod: 'sasl',
          username: data.username,
          saslMechanism: data.saslMechanism,
        };
      }
      const patched = tryPatchRedpandaYaml(
        yamlContent, target.section, target.componentName, setupResult
      );
      if (patched) handleConnectorYamlChange(patched);
    },
  });

  const connectorTopics = useMemo(() => {
    if (!userDialog.target) return;
    return extractConnectorTopics(yamlContent, userDialog.target.section, userDialog.target.componentName);
  }, [userDialog.target, yamlContent]);

  return {
    topicDialog,
    userDialog,
    topicStepRef,
    userStepRef,
    connectorTopics,
    handleAddTopic: (section: string, componentName: string) => {
      topicDialog.open({ section: section as 'input' | 'output', componentName });
    },
    handleAddSasl: (section: string, componentName: string) => {
      userDialog.open({ section: section as 'input' | 'output', componentName });
    },
  };
}
```

### JSX usage (per dialog)

```tsx
<Dialog onOpenChange={(open) => { if (!open) topicDialog.close(); }} open={topicDialog.isOpen}>
  <DialogContent showCloseButton={false} size="lg">
    <DialogCloseButton />
    <DialogHeader>...</DialogHeader>
    <AddTopicStep ref={topicStepRef} ... />
    <div className="flex justify-end gap-2 pt-4">
      <Button onClick={topicDialog.close} variant="secondary-ghost">Cancel</Button>
      <Button
        disabled={topicDialog.isSubmitting}
        icon={topicDialog.isSubmitting ? <Spinner /> : undefined}
        onClick={topicDialog.submit}
      >
        Add
      </Button>
    </div>
  </DialogContent>
</Dialog>
```

## Bug Fixes (bundled)

### 1. Topic creation hang

**Root cause:** `useCreateTopicMutation` `onSuccess` (topic.tsx:117-127) does `await Promise.all([api.refreshTopics(true), queryClient.invalidateQueries(...)])`. If either stalls, `mutateAsync` never resolves, and `triggerSubmit()` hangs forever.

**Fix:** The hook's timeout (default 30s) catches this. After timeout, `close()` is called and a toast shown.

### 2. Missing error toast on topic creation

**Root cause:** `useCreateTopicMutation` `onError` (topic.tsx:129-134) calls `formatToastErrorMessageGRPC(...)` but never passes the result to `toast.error()`. The formatted message goes nowhere.

**Fix:** Change to `toast.error(formatToastErrorMessageGRPC(...))`.

### 3. Missing success toast on topic creation

**Root cause:** `add-topic-step.tsx` `handleSubmit` returns a success result but never calls `toast.success()`. The add-user flow has comprehensive toasts; add-topic has none.

**Fix:** Add `toast.success(...)` in `handleSubmit` after successful `createTopicMutation.mutateAsync()`, and `toast.success(...)` for the existing-topic-selected path.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/use-ref-form-dialog.ts` | New hook |
| `src/components/pages/rp-connect/pipeline/index.tsx` | Refactor `useDiagramDialogs` to use hook, simplify JSX |
| `src/react-query/api/topic.tsx` | Fix `onError` to call `toast.error()` |
| `src/components/pages/rp-connect/onboarding/add-topic-step.tsx` | Add success toasts |
