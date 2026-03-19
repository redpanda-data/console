# Plan: Pipeline Editor Content Update Parity

## Goal
Ensure the command menu and AddConnectorsCard in `pipeline/index.tsx` correctly update the YAML editor, matching the functionality (not the UX) of the old onboarding sidebar.

## Issues

### 1. AddSecretsDialog passed empty data
**File:** `pipeline/index.tsx:687-699`

`existingSecrets={[]}` and `missingSecrets={[]}` means no duplicate prevention and no missing-secret pre-population.

**Fix in `pipeline/index.tsx`:**
- Import `useListSecretsQuery` from `react-query/api/secret`
- Import `extractSecretReferences`, `getUniqueSecretNames` from `components/ui/secret/secret-detection`
- Add query: `const { data: secretsResponse } = useListSecretsQuery({});`
- Derive `existingSecrets` (array of secret IDs from response)
- Derive `missingSecrets` (secrets referenced in `yamlContent` via `extractSecretReferences`/`getUniqueSecretNames` that aren't in `existingSecrets`)
- Pass both to `<AddSecretsDialog>`

### 2. No `onUpdateEditorContent` on AddSecretsDialog
**File:** `pipeline/index.tsx:687-699`

When secret casing is corrected during creation, `QuickAddSecrets` calls `onUpdateEditorContent(oldName, newName)` to fix `${secrets.oldName}` → `${secrets.newName}` in the editor. Not wired up.

**Fix in `pipeline/index.tsx`:**
- Add callback:
```tsx
const handleUpdateEditorContent = useCallback(
  (oldName: string, newName: string) => {
    if (!editorInstance) return;
    const model = editorInstance.getModel();
    if (!model) return;
    const content = model.getValue();
    const updated = content.replaceAll(`\${secrets.${oldName}}`, `\${secrets.${newName}}`);
    if (content !== updated) {
      model.setValue(updated);
    }
  },
  [editorInstance]
);
```
- Pass `onUpdateEditorContent={handleUpdateEditorContent}` to `<AddSecretsDialog>`

### 3. Command menu topics query — verify
**File:** `pipeline-command-menu.tsx:90-101`

Code fetches `useListTopicsQuery({ pageSize: 500 })` and merges with YAML topics. Looks correct in code. Verify at runtime that cluster topics appear. No code change expected.

### 4. Create topic/user dialogs are dead-ends
**File:** `pipeline/index.tsx:701-727`

Both `AddTopicStep` and `AddUserStep` expose `triggerSubmit()` via `useImperativeHandle` on a ref, but:
- Rendered with `ref={null}` — no way to call `triggerSubmit()`
- Only a "Cancel" button — no "Create" button
- No feedback loop back to command menu

**Fix in `pipeline/index.tsx`:**

For the **topic dialog** (lines 701-713):
- Create `const topicStepRef = useRef<BaseStepRef<AddTopicFormData>>(null);`
- Pass `ref={topicStepRef}` instead of `ref={null}`
- Add state: `const [pendingTopicSearch, setPendingTopicSearch] = useState('');`
- Add "Create" button that calls `topicStepRef.current?.triggerSubmit()`, handles result
- On success: close dialog, set `pendingTopicSearch` to created topic name, open command menu
- Import `BaseStepRef` and `AddTopicFormData` from `../types/wizard`

For the **user dialog** (lines 715-727):
- Create `const userStepRef = useRef<UserStepRef>(null);`
- Pass `ref={userStepRef}` instead of `ref={null}`
- Add state: `const [pendingUserSearch, setPendingUserSearch] = useState('');`
- Add "Create" button that calls `userStepRef.current?.triggerSubmit()`, handles result
- On success: close dialog, set `pendingUserSearch`, open command menu
- Import `UserStepRef` from `../types/wizard`

Update the command menu `initialSearch` to incorporate pending topic/user search:
```tsx
initialSearch={pendingSecretSearch || pendingTopicSearch || pendingUserSearch}
```

Clear all pending searches when command menu closes (already done for secrets, extend for topics/users).

### 5. Secret creation → command menu flow — verify
**File:** `pipeline/index.tsx:692-698`

Code looks correct. Creates secret → re-opens command menu pre-populated via `pendingSecretSearch` + `initialSearch`. Verify at runtime.

### 6. AddConnectorsCard wiring — verify
**File:** `pipeline/index.tsx:573-579`

Flow: button → `setAddConnectorType` → `AddConnectorDialog` → `handleConnectorSelected` → `getConnectTemplate` → `handleYamlChange`. Looks correct. Verify at runtime.

## Implementation Order

1. **Step 1** (Issue #1 + #2): Fix `AddSecretsDialog` — add query, compute data, wire `onUpdateEditorContent`
2. **Step 2** (Issue #4): Fix topic/user dialogs — add refs, "Create" buttons, feedback to command menu
3. **Step 3** (Issue #3, #5, #6): Manual verification of remaining flows
