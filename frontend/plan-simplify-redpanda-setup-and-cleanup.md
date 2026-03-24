# Plan: Simplify Redpanda Setup + Delete Dead Code

## Context

Two changes:

1. Replace `RedpandaConnectorSetupWizard` (2-step stepper) with single-purpose dialogs for topic and user — same pattern as `pipeline-command-menu.tsx`. When user selects a Redpanda component from picker, just add template; diagram hints guide them to configure topic/user.
2. Delete dead files: `create-pipeline-sidebar.tsx`, `add-secrets-card.tsx`, `add-contextual-variables-card.tsx`.

## Assumptions

1. `AddTopicStep` and `AddUserStep` work standalone in a Dialog (confirmed — `pipeline-command-menu.tsx` already does this at lines 555-587)
2. Removing the stepper doesn't break any feature-flag-gated path — the stepper was only used in the pipeline diagram UX
3. `add-secrets-card.tsx` and `add-contextual-variables-card.tsx` are only consumed by `create-pipeline-sidebar.tsx` (confirmed via grep)
4. The diagram parser already detects `missingTopic`/`missingSasl` and shows hint buttons — no parser changes needed

> Correct me now or I proceed with these.

---

## Change 1: Replace wizard with direct dialogs

### Current architecture

```
Picker → Redpanda component? → YES → RedpandaConnectorSetupWizard (stepper: topic → user)
                              → NO  → getConnectTemplate → YAML

Diagram hint "+ Topic" → RedpandaConnectorSetupWizard (stepper starting at topic step)
Diagram hint "+ User"  → RedpandaConnectorSetupWizard (stepper starting at user step)
```

### New architecture

```
Picker → ALL components → getConnectTemplate → YAML
         (diagram shows hint buttons for missing topic/SASL)

Diagram hint "+ Topic" → simple Dialog with AddTopicStep → patchRedpandaConfig
Diagram hint "+ User"  → simple Dialog with AddUserStep  → patchRedpandaConfig
```

### Files to modify

| File                                 | Action                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| `pipeline/index.tsx`                 | Replace `RedpandaConnectorSetupWizard` + handlers with 2 simple dialogs                 |
| `pipeline/connector-wizard.tsx`      | Delete `RedpandaConnectorSetupWizard`. Remove Redpanda branching from `ConnectorWizard` |
| `pipeline/connector-wizard.test.tsx` | Update tests — remove wizard stepper tests, add/update connector picker tests           |
| `pipeline/index.test.tsx`            | Update mock, remove wizard-related test setup                                           |

### Step-by-step for `index.tsx`

**Remove:**

- `RedpandaConnectorSetupWizard` import and `RedpandaSetupResult` type import
- `redpandaConnectorToSetup` state (lines 335-339)
- `handleAddTopic` / `handleAddSasl` callbacks that set `redpandaConnectorToSetup`
- `handleRedpandaConnectorSetupComplete` callback
- `<RedpandaConnectorSetupWizard>` render (lines 721-729)
- `RedpandaConnectorSetupStep` import

**Add (follow `pipeline-command-menu.tsx` pattern, lines 555-587):**

```tsx
// State
const [topicDialogTarget, setTopicDialogTarget] = useState<{
  section: "input" | "output";
  componentName: string;
} | null>(null);
const [userDialogTarget, setUserDialogTarget] = useState<{
  section: "input" | "output";
  componentName: string;
} | null>(null);
const [isTopicSubmitting, setIsTopicSubmitting] = useState(false);
const [isUserSubmitting, setIsUserSubmitting] = useState(false);
const topicStepRef = useRef<BaseStepRef<AddTopicFormData>>(null);
const userStepRef = useRef<UserStepRef>(null);

// Callbacks for diagram hints
const handleAddTopic = useCallback((section: string, componentName: string) => {
  setTopicDialogTarget({
    section: section as "input" | "output",
    componentName,
  });
}, []);

const handleAddSasl = useCallback((section: string, componentName: string) => {
  setUserDialogTarget({
    section: section as "input" | "output",
    componentName,
  });
}, []);

// Submit handlers
const handleTopicSubmit = useCallback(async () => {
  const ref = topicStepRef.current;
  if (!ref || !topicDialogTarget) return;
  setIsTopicSubmitting(true);
  const result = await ref.triggerSubmit();
  if (result.success && result.data?.topicName) {
    const patched = tryPatchRedpandaYaml(
      yamlContent,
      topicDialogTarget.section,
      topicDialogTarget.componentName,
      { topicName: result.data.topicName },
    );
    if (patched) handleConnectorYamlChange(patched);
    setTopicDialogTarget(null);
  }
  setIsTopicSubmitting(false);
}, [topicDialogTarget, yamlContent, handleConnectorYamlChange]);

const handleUserSubmit = useCallback(async () => {
  const ref = userStepRef.current;
  if (!ref || !userDialogTarget) return;
  setIsUserSubmitting(true);
  const result = await ref.triggerSubmit();
  if (result.success && result.data) {
    const data = result.data;
    let setupResult: RedpandaSetupResultLike = {};
    if ("authMethod" in data && data.authMethod === "service-account") {
      setupResult = {
        authMethod: "service-account",
        serviceAccountSecretName: data.serviceAccountSecretName,
      };
    } else if ("username" in data) {
      setupResult = {
        authMethod: "sasl",
        username: data.username,
        saslMechanism: data.saslMechanism,
      };
    }
    const patched = tryPatchRedpandaYaml(
      yamlContent,
      userDialogTarget.section,
      userDialogTarget.componentName,
      setupResult,
    );
    if (patched) handleConnectorYamlChange(patched);
    setUserDialogTarget(null);
  }
  setIsUserSubmitting(false);
}, [userDialogTarget, yamlContent, handleConnectorYamlChange]);
```

**JSX — replace `<RedpandaConnectorSetupWizard>` with:**

```tsx
{
  /* Topic dialog — triggered by diagram "+ Topic" hint */
}
<Dialog
  onOpenChange={(open) => {
    if (!open) setTopicDialogTarget(null);
  }}
  open={topicDialogTarget !== null}
>
  <DialogContent size="xl">
    <DialogHeader>
      <DialogTitle>Add topic</DialogTitle>
    </DialogHeader>
    <AddTopicStep hideTitle ref={topicStepRef} />
    <div className="flex justify-end gap-2 pt-4">
      <Button
        disabled={isTopicSubmitting}
        onClick={() => setTopicDialogTarget(null)}
        variant="secondary-ghost"
      >
        Cancel
      </Button>
      <Button disabled={isTopicSubmitting} onClick={handleTopicSubmit}>
        {isTopicSubmitting ? <Spinner /> : "Add"}
      </Button>
    </div>
  </DialogContent>
</Dialog>;

{
  /* User dialog — triggered by diagram "+ User" hint */
}
<Dialog
  onOpenChange={(open) => {
    if (!open) setUserDialogTarget(null);
  }}
  open={userDialogTarget !== null}
>
  <DialogContent size="xl">
    <DialogHeader>
      <DialogTitle>Add user</DialogTitle>
    </DialogHeader>
    <AddUserStep
      hideTitle
      ref={userStepRef}
      showConsumerGroupFields={userDialogTarget?.section === "input"}
      topicName={undefined}
    />
    <div className="flex justify-end gap-2 pt-4">
      <Button
        disabled={isUserSubmitting}
        onClick={() => setUserDialogTarget(null)}
        variant="secondary-ghost"
      >
        Cancel
      </Button>
      <Button disabled={isUserSubmitting} onClick={handleUserSubmit}>
        {isUserSubmitting ? <Spinner /> : "Add"}
      </Button>
    </div>
  </DialogContent>
</Dialog>;
```

### Step-by-step for `connector-wizard.tsx`

**Delete entirely:** `RedpandaConnectorSetupWizard` function (lines 55-201), `RedpandaSetupResult` type

**Simplify `ConnectorWizard`:**

- Remove `redpandaConnectorConfig` state
- Remove `handleRedpandaSetupComplete`
- Remove `REDPANDA_TOPIC_AND_USER_COMPONENTS` check in `handleConnectorSelected`
- Remove `<RedpandaConnectorSetupWizard>` render
- All connectors now go through `getConnectTemplate` uniformly

```tsx
// Simplified handleConnectorSelected — no Redpanda branching
const handleConnectorSelected = useCallback(
  (connectionName: string, connectionType: ConnectComponentType) => {
    onClose();
    const newYaml = getConnectTemplate({
      connectionName,
      connectionType,
      components,
      showAdvancedFields: false,
      existingYaml: yamlContent,
    });
    if (newYaml) {
      onYamlChange(newYaml);
    }
  },
  [components, yamlContent, onYamlChange, onClose],
);
```

**Remove from exports:** `RedpandaConnectorSetupWizard`, `RedpandaSetupResult`

**Remove imports no longer needed:** `applyRedpandaSetup`, `REDPANDA_TOPIC_AND_USER_COMPONENTS`, stepper components, step components, wizard types

### Impact on `index.tsx` imports

**Remove:** `RedpandaConnectorSetupWizard`, `RedpandaSetupResult`, `RedpandaConnectorSetupStep`, `applyRedpandaSetup`

**Add:** `tryPatchRedpandaYaml`, `type RedpandaSetupResultLike` (from `../utils/yaml`), `AddTopicStep`, `AddUserStep`, `BaseStepRef`, `UserStepRef`, `AddTopicFormData`, `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`, `Spinner`

---

## Change 2: Delete dead code

| File                                           | Status | Reason                                         |
| ---------------------------------------------- | ------ | ---------------------------------------------- |
| `onboarding/create-pipeline-sidebar.tsx`       | DELETE | Zero imports in codebase                       |
| `onboarding/add-secrets-card.tsx`              | DELETE | Only imported by `create-pipeline-sidebar.tsx` |
| `onboarding/add-contextual-variables-card.tsx` | DELETE | Only imported by `create-pipeline-sidebar.tsx` |

---

## Implementation Order

1. Delete 3 dead files (Change 2) — independent, no risk
2. Simplify `connector-wizard.tsx` — remove Redpanda branching + delete `RedpandaConnectorSetupWizard`
3. Update `index.tsx` — replace wizard with direct dialogs
4. Update tests
5. Verify: `bun run type:check && bun run lint`
6. Run targeted tests

## Tradeoffs

| Decision                  | Benefit                                                    | Cost                                                     |
| ------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| Direct dialogs vs stepper | Simpler UX, one action per dialog, no step navigation      | Two separate dialogs instead of one wizard               |
| Uniform picker flow       | All components behave the same, diagram hints guide config | User must know to click hint buttons for Redpanda config |
| Delete dead files         | Reduces codebase size, removes confusion                   | None — files are truly unused                            |

## Adversarial review impact

This change resolves finding #1 (HIGH — skip topic loss) from the adversarial review by removing the wizard entirely. The skip/topic state management issue disappears because there's no stepper to skip through.

Finding #2 (MEDIUM — static dialog description) also disappears — no stepper means no step-dependent description.

## Unresolved

- Should `AddTopicStep` in the diagram dialog support `selectionMode="new"` (create-only) or default (create + select existing)? The command menu uses `selectionMode="new"`. The wizard used default. Propose: **use default** (allows selecting existing topics), since users may have pre-existing topics.
