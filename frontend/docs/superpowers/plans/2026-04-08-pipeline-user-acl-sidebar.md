# Pipeline User ACL from Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the "Add User" dialog is triggered from a Redpanda connector leaf in the pipeline sidebar, extract the connector's topic(s) from YAML and pass them to `AddUserStep` so that ACL creation and permission alerts work correctly. Also rename the misleading `superuser` form field to `grantTopicPermissions`.

**Architecture:** `AddUserStep` already supports `topicName` prop with ACL checkbox + permission alerts. The pipeline sidebar dialog passes `topicName={undefined}`, bypassing all of this. Fix: (1) extract topics from connector YAML, (2) pass single-topic to `AddUserStep`, (3) multi-topic → standalone alert, (4) update dialog description, (5) rename `superuser` → `grantTopicPermissions`.

**Tech Stack:** React 18.3, YAML parsing (yaml library), Zod, react-hook-form

**Verified:** `redpanda_common` topics are at the same YAML path as all other components (`input.redpanda_common.topics[]` / `output.redpanda_common.topic`). Only SASL is special (root level). No special handling needed for topic extraction.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/pages/rp-connect/utils/yaml.ts` | Modify | Add `extractConnectorTopics()` helper |
| `src/components/pages/rp-connect/pipeline/index.tsx` | Modify | Extract topics, pass to dialog, update dialog description |
| `src/components/pages/rp-connect/onboarding/add-user-step.tsx` | Modify | Rename `superuser` → `grantTopicPermissions` in form field/rendering |
| `src/components/pages/rp-connect/types/wizard.ts` | Modify | Rename `superuser` → `grantTopicPermissions` in Zod schema + type |
| `src/components/pages/rp-connect/utils/user.ts` | Modify | Rename `superuser` → `grantTopicPermissions` in ACL creation logic |

---

### Task 1: Rename `superuser` → `grantTopicPermissions` across the add-user flow

The field named `superuser` actually controls per-topic ACL creation, not superuser status. Rename it everywhere for clarity.

**Files:**
- Modify: `src/components/pages/rp-connect/types/wizard.ts:87` (Zod schema)
- Modify: `src/components/pages/rp-connect/onboarding/add-user-step.tsx:138,664` (form default + field)
- Modify: `src/components/pages/rp-connect/utils/user.ts:430` (ACL creation check)

- [ ] **Step 1: Rename in the Zod schema (`wizard.ts`)**

In `src/components/pages/rp-connect/types/wizard.ts`, line 87, change:

```tsx
superuser: z.boolean().default(true),
```

To:

```tsx
grantTopicPermissions: z.boolean().default(true),
```

- [ ] **Step 2: Rename in the form defaults (`add-user-step.tsx`)**

In `src/components/pages/rp-connect/onboarding/add-user-step.tsx`, line 138, change:

```tsx
superuser: true,
```

To:

```tsx
grantTopicPermissions: true,
```

- [ ] **Step 3: Rename the form field rendering (`add-user-step.tsx`)**

Around line 664, change:

```tsx
name="superuser"
```

To:

```tsx
name="grantTopicPermissions"
```

- [ ] **Step 4: Rename in the ACL creation logic (`user.ts`)**

In `src/components/pages/rp-connect/utils/user.ts`, line 430, change:

```tsx
if (topicName && userData.superuser) {
```

To:

```tsx
if (topicName && userData.grantTopicPermissions) {
```

- [ ] **Step 5: Search for any other references to `superuser` in the rp-connect directory**

Run: `grep -r "superuser" src/components/pages/rp-connect/`

Fix any remaining references.

- [ ] **Step 6: Run type check**

Run: `bun run type:check`

---

### Task 2: Add `extractConnectorTopics` helper

**Files:**
- Modify: `src/components/pages/rp-connect/utils/yaml.ts`

- [ ] **Step 1: Add `extractConnectorTopics` after `patchRedpandaConfig`**

```tsx
/**
 * Extract topic(s) configured on a Redpanda connector from YAML.
 * Works for all Redpanda component types — topics are always at
 * `[section].[componentName].topics[]` (inputs) or `.topic` (outputs).
 */
export function extractConnectorTopics(
  yamlContent: string,
  section: 'input' | 'output',
  componentName: string,
): string[] | undefined {
  if (!yamlContent.trim()) {
    return;
  }

  let doc: Document.Parsed;
  try {
    doc = parseDocument(yamlContent);
  } catch {
    return;
  }

  const topics = doc.getIn([section, componentName, 'topics']);
  if (Array.isArray(topics)) {
    const filtered = topics.filter((t): t is string => typeof t === 'string' && t !== '');
    return filtered.length > 0 ? filtered : undefined;
  }

  const topic = doc.getIn([section, componentName, 'topic']);
  if (typeof topic === 'string' && topic !== '') {
    return [topic];
  }

  return;
}
```

- [ ] **Step 2: Run type check**

Run: `bun run type:check`

---

### Task 3: Pass topic context to the Add User dialog + update description

**Files:**
- Modify: `src/components/pages/rp-connect/pipeline/index.tsx` (~lines 920-953)

- [ ] **Step 1: Import `extractConnectorTopics` and `TanStackRouterLink`**

Add `extractConnectorTopics` alongside the existing `tryPatchRedpandaYaml` import. Check if `Link`/`TanStackRouterLink` from `@tanstack/react-router` is already imported — add if not. Also check if `Alert`, `AlertTitle`, `AlertDescription` are imported — they should be since they're used elsewhere in the file.

- [ ] **Step 2: Add `connectorTopics` memo**

Inside the `useConnectorDialogs` hook (or wherever the dialog state lives), add:

```tsx
const connectorTopics = useMemo(() => {
  if (!userDialogTarget) {
    return undefined;
  }
  return extractConnectorTopics(yamlContent, userDialogTarget.section, userDialogTarget.componentName);
}, [userDialogTarget, yamlContent]);
```

Return it from the hook alongside the other dialog state if needed.

- [ ] **Step 3: Update the dialog description text**

Change the `DialogDescription` from:

```tsx
<DialogDescription className="mt-4">
  This component requires a Redpanda user for logging the data. Select an existing user, or create a new one.
</DialogDescription>
```

To:

```tsx
<DialogDescription className="mt-4">
  Select or create a user for this connector. ACLs will be configured automatically for the topic when creating a new user.
</DialogDescription>
```

- [ ] **Step 4: Add multi-topic alert and pass `topicName` to `AddUserStep`**

Replace the `AddUserStep` block with:

```tsx
{connectorTopics && connectorTopics.length > 1 && (
  <Alert variant="warning">
    <AlertTitle>Multiple topics configured</AlertTitle>
    <AlertDescription>
      This connector uses multiple topics ({connectorTopics.join(', ')}). You will need to configure topic ACLs for this user manually in the{' '}
      <TanStackRouterLink params={{ tab: 'acls' }} to="/security/$tab">
        Security settings
      </TanStackRouterLink>.
    </AlertDescription>
  </Alert>
)}
<AddUserStep
  className="border"
  hideTitle
  ref={userStepRef}
  showConsumerGroupFields={userDialogTarget?.section === 'input'}
  topicName={connectorTopics?.length === 1 ? connectorTopics[0] : undefined}
/>
```

Behavior:
- **Single topic**: `topicName` is passed → checkbox (checked for new users), permission alerts for existing users
- **Multiple topics**: `topicName` undefined + warning alert telling user to configure ACLs manually
- **No topics configured**: same as before (no ACL section shown)

- [ ] **Step 5: Run type check**

Run: `bun run type:check`

---

### Task 4: Final verification

- [ ] **Step 1: Run type check**

Run: `bun run type:check`

- [ ] **Step 2: Run lint**

Run: `bun run lint`

- [ ] **Step 3: Run any existing tests for rp-connect**

Run: `bun run test:unit -- src/components/pages/rp-connect/`

And: `bun run test:integration -- src/components/pages/rp-connect/`

Fix any failures from the `superuser` → `grantTopicPermissions` rename.
