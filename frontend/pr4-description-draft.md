## Summary
- Redesigns the pipeline page with an IDE-like resizable panel layout across all three modes (view, edit, create)
- **View mode:** read-only details panel (pipeline info, throughput chart, tags, secrets/topics references), logs panel, and flow diagram sidebar
- **Edit/create mode:** YAML editor with lint hints, config dialog (name, description, compute units, tags), command palette (Cmd+Shift+P), connector picker, and mini wizard for Redpanda components
- **Flow diagram:** renders `PipelineFlowDiagram` in the left sidebar for all modes, gated behind `enablePipelineDiagrams` feature flag. Redpanda component leaves show setup-hint buttons ("+ Topic", "+ User") when topic/SASL config is missing, and doc links on hover
- **Connector wizard:** `RedpandaConnectorSetupWizard` extracted as a standalone component, reusable from both the connector picker (Flow A) and diagram hint buttons (Flow B). Uses surgical YAML patching (`applyRedpandaSetup`) instead of onboarding store side effects
- **Bug fix:** serverless init — extracted to `useCreateModeInitialYaml` hook. `useEffect` early-returns when `components.length === 0`, reads `sessionStorage` directly as hydration fallback, includes 3s timeout. Fixes race where `getConnectTemplate` silently failed before component list resolved
- **Persisted YAML decoupling:** when `enablePipelineDiagrams` is active, YAML is no longer synced to the onboarding YAML store (the diagram UX doesn't use the wizard persistence path)

## PR #2284 review comments addressed
- Extracted throughput chart helpers to `utils/pipeline-throughput.utils.ts` with unit tests
- Removed unnecessary `useMemo`/`useCallback` in throughput card
- Regenerated `yarn.lock`

## Test coverage (19 test files, ~240 test cases)

**Onboarding steps (24 tests):**
- `add-topic-step.test.tsx` — topic creation/selection form, validation, error states
- `add-user-step.test.tsx` — SASL + service account auth flows, consumer group fields

**Pipeline page (66 tests):**
- `index.test.tsx` (17) — create/edit/view mode rendering, form validation, save/cancel flows, serverless init skeleton
- `config-dialog.test.tsx` (9) — name input, description, compute slider, tags CRUD
- `details-dialog.test.tsx` (11) — pipeline info, compute units, URL, service account, tags, secrets, topics, delete
- `connector-wizard.test.tsx` (15) — connector picker → Redpanda setup wizard flow, SASL/service-account branching
- `pipeline-command-menu.test.tsx` (14) — slash command menu, variable insertion, keyboard navigation

**Flow diagram (30 tests):**
- `pipeline-flow-diagram.test.tsx` (15) — empty/error states, section headers, placeholder nodes, topic badges, setup hint buttons ("+ Topic" / "+ User"), docs links
- `pipeline-flow-nodes.test.ts` (6) — `getConnectorDocsUrl` for inputs/outputs/processors, non-docs sections
- `pipeline-flow-parser.test.tsx` (9 new) — `missingTopic`/`missingSasl` flags on Redpanda components, SASL detection (component-level + root `redpanda.sasl`), flag passthrough to layout

**Utilities (109 tests):**
- `yaml.test.tsx` (24 new) — `patchRedpandaConfig` (topic/SASL patching), `applyRedpandaSetup` (surgical patch + template fallback), `generateYamlFromWizardData`, `buildSaslPatch` (service-account + SASL)
- `use-create-mode-initial-yaml.test.tsx` (12) — serverless path, non-serverless restoration, timeout, disabled state, diagrams-enabled gating
- `use-slash-command.test.ts` + `.test.tsx` (61) — slash trigger detection, cursor positioning, command insertion, popover lifecycle
- `pipeline-throughput.utils.test.ts` (12) — series merging, timestamp formatting, empty data handling

**Other (15 tests):**
- `constants.test.ts` (5) — `isSystemTag`, `isCloudManagedTagKey`
- `onboarding-wizard-store.test.tsx` (5) — store hydration, `getWizardConnectionData` sessionStorage fallback

## Feature flags
- `enablePipelineDiagrams` — gates `PipelineFlowDiagram` in the left sidebar (all modes), setup hint buttons, doc links, and YAML persistence decoupling
- `enableConnectSlashMenu` — gates inline `/` slash command menu in the YAML editor
- `enableRpcnTiles` — gates the tile-based connector picker in the onboarding wizard
- `enableNewPipelineLogs` — gates `LogExplorer` vs legacy `LogsTab` in view mode

## Known issues
- **react-doctor `set-state-in-effect`** at `index.tsx:321` — `setYamlContent(pipeline.configYaml)` in the form-reset effect triggers a React Compiler warning. Alternative approaches (`queueMicrotask`, derivation, key-remount) have worse tradeoffs. Bounded to one extra render per pipeline load.

## Reviewer actions
1. Verify `add-secrets-dialog.tsx` signature change (`onSecretsCreated: (secretNames?: string[]) => void`) doesn't break callers in `onboarding-wizard.tsx` and `api-connect-wizard.tsx` — param is optional so existing callers should work
2. Verify onboarding wizard still works end-to-end after Card wrapper removal at CREATE_CONFIG step — PipelinePage now owns its own layout
3. Test edit mode: open an existing pipeline → verify resizable panel layout, editable name in toolbar, config dialog (Settings button), command menu (Cmd+Shift+P), connectors card in left sidebar
4. Test create mode via wizard: reach final step → verify same layout as edit, form fields persist across wizard navigation
5. Test view mode: open a pipeline in view → verify details panel, throughput card, logs panel, toolbar status badge + start/stop + edit
6. With `enablePipelineDiagrams` on: verify flow diagram renders in left sidebar for all three modes, setup hint buttons work ("+ Topic" / "+ User"), doc links open correct URLs
7. With `enablePipelineDiagrams` on: add a Redpanda connector via the picker → complete topic step → **skip** user step → verify topic is configured in the YAML
