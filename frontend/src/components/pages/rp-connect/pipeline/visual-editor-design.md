# RPCN Visual Editor — Design & Requirements

Feature flag: `enableRpcnVisualEditor` (defined in `src/components/constants.ts`)
Owner area: `src/components/pages/rp-connect/pipeline/`

## How RPCN pipelines actually flow (research)

Redpanda Connect (Benthos) data flow, confirmed against the docs:

- A pipeline is `input → (buffer) → pipeline.processors (in order) → output`.
- **input `broker`/`sequence`** combine multiple child inputs — the children **fan
  in / merge** into one stream that feeds the pipeline (data flows child → broker).
- **`pipeline.processors`** is an ordered list; each processor transforms the
  message and passes it to the next: `proc0 → proc1 → … → procN`.
- **output `broker`/`switch`/`fallback`** fan a single stream **out** to multiple
  child outputs (data flows broker → children).
- **Container processors** are steps in the main line that run a sub-pipeline; the
  message enters, the inner steps run, then flow continues to the next processor:
  - sequential sub-pipelines: `branch` (on a copy via request/result map),
    `try`, `catch`, `for_each`, `while`, `retry`, `group_by` — children run in order.
  - alternatives / parallel: `switch` (one matching case runs), `workflow`
    (DAG of stages), `parallel` (children across the batch) — children fan out.

**Visualization model** (mirrors AWS Step Functions Workflow Studio and Apache
NiFi process groups): the **main path is linear** (input → each processor →
output) and **container processors are titled boxes that visually enclose their
inner flow**. Sequential children chain inside the box; alternatives/parallel and
merged broker inputs are shown enclosed without inter-child arrows. This is why
e.g. an `http` processor inside a `parallel` is drawn *inside the parallel box*
rather than wired directly to the next top-level processor — the message goes
through `parallel` (which runs `http`) and then on to the next step.

Sources: Redpanda Connect docs (processing pipelines, broker input, branch
processor); AWS Step Functions Workflow Studio (nested Parallel/Map canvases).

## Implementation status

The dedicated, full-canvas visual editor has shipped (behind the flag):

- **Dedicated left→right canvas** (`pipeline-flow-canvas.tsx`) — its own React Flow
  surface with background dots, pan/zoom and Controls. It does **not** reuse the
  mini sidebar diagram. Layout is `computeFlowLayout` (deterministic): the data
  flow (input → top-level processors → output) runs left→right as a spine of large
  cards; a processor containing a sub-pipeline (branch/catch/switch) threads its
  inner steps downward beneath it; resources sit in a lane below. Edges route
  through the actual nodes via smooth-step paths and per-node handles.
- **Larger node cards** (`pipeline-flow-canvas-nodes.tsx`) showing a kind badge,
  connector logo + name, and the most important config values (`meta`, from
  `pipeline-flow-meta.ts`), with hover Edit/Remove/Docs and a `+` insertion
  affordance on the spine.
- **Role-aware card meta** (`pipeline-flow-meta.ts`): a curated per-connector
  field map (~40 components across input/processor/output/resource — e.g. kafka
  `consumer_group`, s3 `bucket`/`prefix`, sql `driver`/`table`, http `url`/`verb`,
  cache `resource`/`operator`/`key`, rate-limit `count`/`interval`) picks 1–3
  concise rows; unknown components fall back to identifying-named scalars
  (url/host/path/table/…) before any scalar. Verbose keys are shortened
  (`consumer_group`→`group`, `default_ttl`→`ttl`). **Topics render as chips**
  (the top fact for a Kafka source/sink) and are never duplicated as a meta row.
  Containers stay header-only — their children are the content.
- **Form-based per-node editor** (`node-config-form.tsx`): renders the component
  schema's scalar fields (required first, optional with defaults, advanced
  collapsed, enums as selects, bools as switches), with a raw-YAML fallback for
  nested objects/arrays and for components whose schema we don't have
  (`node-inspector.tsx` chooses form vs. raw, in the right rail).
- All edits remain deterministic YAML mutations (`utils/yaml.ts`):
  `getComponentAt`, `setComponentAt`, `removeComponentAt`, `insertProcessorAt`,
  `appendResource`, `buildInsertableComponent`, keyed by an `EditTarget`.

### Flow semantics (data-flow accuracy)

Beyond the left→right spine, the canvas draws **how data actually moves**, so
containers are no longer black boxes (informed by NiFi relationship labels, Step
Functions Choice/Parallel/Catch, n8n copy-fan-out, Apache Hop copy-vs-error hops):

- **Branch** (`branch`): rendered as **copy-out → sub-pipeline → merge-back**. A
  dashed `copy` edge (request_map) leaves the container into the sub-pipeline; a
  dashed `merge` edge (result_map) returns to it. The message itself passes through
  on the spine; the branch only enriches it.
- **Switch / fallback fan-out** (processor `switch`, output `switch`/`fallback`):
  one labeled fan-out edge per case, **labeled with its `check` condition**; a case
  with no check is drawn explicitly as **`default`**. Applies to both processor and
  output switches.
- **Error / dead-letter paths**: `catch` handlers, `errored()` routes and fallback
  tiers use a distinct **red dashed** edge style (`tone: 'error'`).
- **Sequential containers** (`try`/`for_each`/`while`/`retry`/`group_by`/cases):
  an entry edge from the container header into the first child, then the children
  chain in order.
- **Input merge** (broker/sequence): child sources **fan in** to the container.
- **Resource references**: a muted dashed **`uses`** edge from a component to the
  resource it references (cache/rate_limit `resource:`), matched by resource label.

Mechanics: containers expose two internal handles — `gs` (header source, emits
entry/copy/fan-out) and `gt` (header target, receives merge-back/fan-in). All
non-spine edges share one configurable edge type (`flowLink`) whose stroke colour,
dash and optional label come from edge `data` (`tone` ∈ primary|muted|error,
`dashed`, `label`). Condition labels and reference edges are **suppressed in the
compact sidebar** to keep it clean.

Supporting polish:

- **Resources sit under the node that uses them.** In horizontal layout each
  resource's x is aligned to the (absolute) x of its referencing component, then a
  left→right sweep de-overlaps the lane — so a `uses` edge is a short drop, not a
  full-canvas traversal (`resourceLaneX`/`absoluteX`).
- **Section colour accents.** Cards/containers carry a left accent + tinted kind
  label by role (input green, processor blue, output purple, resource orange) so
  sources/transforms/sinks/resources read apart at a glance (`SECTION_ACCENT`).
- **Adaptive edge legend.** The full canvas shows a small bottom-left legend that
  lists only the edge kinds actually present (flow / copy-merge / error / uses).
- **Roomy container routing.** A container reserves a wider routing gutter
  (`fanGutter`) on the side it fans out (`gs`) and/or merges/fans in (`gt`), plus
  extra vertical spacing between fanned children (`fanGap`) — see `containerInsets`
  — so switch/branch/broker edges aren't crammed against the box edge. Each fanned
  sibling routes down its **own vertical lane** in that gutter (`laneOffset` →
  per-edge `centerX` in `FlowLinkEdge`) so parallel branches never overlap on a
  shared trunk. The fanning port (`gs`/`gt`) is **anchored at the vertical centre of
  the children area** (`portY`, computed from the container height, passed to
  `ContainerHandles`) so branches radiate level with the children — copy/merge come
  out horizontal and switch branches diverge immediately rather than running
  parallel down a gutter. Lanes nest **like parentheses around the centre port**
  (`fanLanes`): cases above the port keep the staircase (outermost hugs the
  border, nearer cases nest deeper) and cases below mirror it; the halves never
  share a y-range so they reuse lane offsets — provably crossing-free, on both
  the fan-out and fan-in sides. A resource whose referencing node is collapsed
  away also **aligns under the visible ancestor** (`resourceLaneX` walks up to
  the collapsed box), matching the edge re-anchoring.
- **No on-edge text labels.** Routing conditions are chips on cards and the edge
  vocabulary lives in the legend; the only edge labels are the short branch
  `copy`/`merge`, lifted above their (horizontal) lines via `labelOffsetY`.
- **Cable management on dense graphs** (`decorateEdges` in the canvas):
  resource-reference (`uses`) edges idle at a readable faint level
  (muted-foreground @ ~60%), and dim to ~25% only when an unrelated node is
  selected (like every other edge). Selection/hover scope includes a
  container's **whole subtree**, so selecting a branch keeps its internal
  chains/copy/merge lit while unrelated edges fade.
- **The highlight family is brand orange-red.** The selection ring, the selected
  node's connected lines, their arrowheads, and port sockets all render in the
  Redpanda `brand` colour (`strokeFor`/`withHighlightMarker`) so the highlight
  stands apart from the blue data-flow lines — error edges keep their red.
- **Processor fans reconverge.** A parallel *processor* container
  (switch/parallel/workflow) draws fan-in edges from each alternative back to
  its right port — data flows back out and continues to the next step — with
  the same per-branch lanes, tones, and port sockets as the fan-out. *Output*
  fans (broker/switch/fallback outputs) terminate at their sinks and draw none.
- **Channel routing for reference edges.** Each `uses` edge exits its node with a
  short drop, runs across to the **clear channel beside its top-level column**
  (mid-`colGap`, staggered when shared), down the channel, along a **bus** above
  the resource lane, then into the resource (`referenceRoute` in the parser →
  `orthogonalRoundedPath` in the edge) — never dropping through the nodes
  stacked below the source.
- **Collapse re-anchoring.** A reference whose source is hidden inside a
  collapsed container re-anchors to the **nearest visible ancestor**
  (`visibleAnchor`), so resources never dangle disconnected while collapsed.
- **Container ports sit level with the child rows.** `containerPortYs` anchors a
  branch's `gs` (copy) at the **first child's connector row** and its `gt` (merge)
  at the **last child's row** — those edges are clean horizontal lines in the
  child's own row, never elbowing through the header or its icon. Fanning
  containers (switch/parallel/broker) keep a children-area **centre trunk** that
  the lanes radiate from. `FLOW_SPINE_HANDLE_TOP` is the single source of truth
  for the connector-row offset (canvas imports it).
- **No entry edges on sequential containers.** Containment already shows the flow
  (the spine arrives at the box itself) and the narrow sequential inset would
  render an entry edge as an unreadable stub. The semantics live on the card:
  `catch` shows a red **"on error"** chip (joining the `if <check>` / `default`
  chip vocabulary); chain edges show internal order.
- **Port sockets.** Entry/copy/merge/fan-out/fan-in edges draw a small circle at
  the exact point they meet the container boundary (`portDot` on the edge data,
  rendered by `FlowLinkEdge` at the true endpoint) — NiFi-style ports, so the
  lines visibly plug into containers instead of trailing off their borders.
- **Conditions as chips, not floating labels.** A branch's routing condition is a
  chip on the receiving card (`if <check>` / `default`, red for error routes) via
  `BranchConditionChip`, so fan-out edges stay clean unlabeled lines. All of this is derived purely from
`parsePipelineFlowTree` (new node fields: `condition`, `isDefault`, `isErrorPath`,
`branch`, `resourceRef`) — still 100% deterministic from YAML.

### Template gallery entry point

When the pipeline is empty (only section labels / `none` placeholders) and editing,
a floating **"Start from a template"** card (`template-cta.tsx`, `motion/react`
enter/exit animation) appears pinned to the bottom — in the **sidebar visualizer**
(full-width) and on the **full visual editor** (centered). It opens the
`TemplateGalleryDialog` and animates away once the pipeline gets real content.

### Flow completeness (problems, secrets, keyboard, saving)

- **Problems overview.** A floating "N problems" chip (top-right of the canvas,
  `pipeline-problems-panel.tsx`) expands into the full lint list; clicking a
  problem **selects the offending node** (inspector opens on it). Hints that don't
  map to a node are listed inert.
- **Missing secrets.** The Visual lane detects `${secrets.X}` references missing
  from the secrets store (`useListSecretsQuery` + `secret-detection` utils) and
  shows a warning banner (top-center); it opens the shared `AddSecretsDialog`
  (create new / rename to an existing secret — rename rewrites the YAML refs).
- **⌘S / Ctrl+S saves** in edit/create mode (page-level, both lanes), instead of
  the browser save dialog.
- **Canvas keyboard.** Escape deselects; Delete/Backspace removes the selected
  node; ⌘Z/⌘⇧Z undo/redo — all ignored while typing in a field or Monaco.
- **Inline numeric validation.** Int/float form fields flag unparseable literals
  ("Not a valid integer") — `${…}` interpolations are exempt (legitimate anywhere).

### Lint feedback & unsaved state

- **In-context lint.** Server lint hints are line/column-based; `mapLintHintsToNodes`
  (`utils/pipeline-lint.ts`) parses the YAML with a `LineCounter`, computes each
  editable node's YAML line range (via its edit-target path), and attaches each hint
  to the **most specific** node whose range contains the hint's line. Nodes with
  problems get a red ring + an alert badge (count, messages on hover) on the canvas,
  and the inspector shows the full messages (with line numbers) for the selected
  node. Hints that don't fall inside a node still appear in the YAML lint list.
- **Unsaved indicator.** `PipelineEditHeader` shows an amber "Unsaved changes" dot
  next to Save whenever `hasUnsavedChanges` (form dirty or YAML differs from the
  loaded config) — so applying a node edit in the rail makes the pending save obvious.

### Editing experience

- **Figma-style inspector rail (not modals).** The Visual lane is a flex row:
  the canvas (`flex-1`) plus an always-present right rail (`NodeInspector`,
  `w-96`, `border-l`). Clicking a node **selects** it (React Flow `onNodeClick`,
  highlighted with a ring; `onPaneClick` clears); the rail then shows that node's
  identity (logo / kind / name) with docs + remove actions and its config — a
  schema form (editable components) or scoped YAML (unknown schema). Edits are
  applied with an **Apply changes** button (enabled only when something changed).
  In the read-only view lane the rail shows the component as read-only YAML. There
  is no per-node edit/delete button and no edit dialog — selection is the affordance
  (the container collapse chevron is a separate control that doesn't select).
- **Every node is editable, including nested ones.** Beyond the top-level
  input/output/processor/resource targets, the parser threads the YAML **path**
  through branch/switch/try/catch/for_each/broker and assigns each nested component
  a `{ kind:'path', path, componentType }` editTarget. So the `http` inside a
  `branch`, an output inside a `switch` case, etc. all get an edit (and remove)
  button and open the **same** dialog. `getComponentAt`/`setComponentAt`/
  `removeComponentAt` resolve a path target directly (nested delete prunes an
  emptied `processors` array). `componentType` follows the section so the right
  schema loads (processors → processor, broker inputs → input, …).
- **The form shows the full schema, recursively.** `node-config-form.tsx` renders
  required → optional → advanced, with **defaults shown as hints**, descriptions,
  enum selects, bool switches, scalar **arrays** (one value per line), and nested
  **object groups** (`tls`, `batching`, `sasl`, …) as collapsible sub-sections that
  recurse through the same renderer. Assembly is path-based (`setInObj`/`deleteInObj`):
  it starts from a clone of the existing config so unrendered complex settings are
  preserved, writes only non-empty/changed values (keeping the YAML minimal), and
  drops emptied objects. Genuinely complex leaves (object arrays, maps, 2-D arrays,
  nested component configs, unknown keys) still round-trip via a scoped raw-YAML
  fallback.

Shared node IDs: both the canvas and the mini sidebar diagram derive from the same
`parsePipelineFlowTree` output, so node IDs line up across views.

**Mini sidebar lane**: renders the **same `PipelineFlowCanvas`** as the Visual tab
but in a `simple` + `orientation="vertical"` mode — a compact, static overview:
- `simple`: no background dots, no zoom, no free pan, no controls — locked at
  zoom 1, **top-aligned**, with vertical scroll only for tall pipelines.
- `compact`: smaller one-row cards (no kind badge / metadata), tighter spacing
  (`COMPACT_DIMS` in `computeFlowLayout`).
- Straight connectors: the top/bottom handles are anchored at a fixed left offset
  (`SPINE_HANDLE_LEFT`), so vertically-stacked cards of differing widths connect on
  a straight vertical line rather than center-to-center diagonals.
- Section dividers (`INPUT`/`PROCESSORS`/`OUTPUT`) are indented
  (`FLOW_SECTION_LABEL_INDENT`) so the spine runs clear to their left.

The old indented-tree layout (`computeTreeLayout` / `PipelineFlowDiagram`) is no
longer used by the page (kept for now, still tested).

Not yet built (deferred): the cross-view **morph animation** (nodes gliding
between the mini lane and the canvas) and the matching arrow-flow polish of the
mini lane; full recursive form editing of deeply nested fields (nested still uses
the raw-YAML fallback); multi-input/output array editing; reorder. See §10.
§4 records why we used **edit targets** instead of generic paths.

This document captures the analysis, design, and requirements for the Redpanda
Connect (RPCN) **Visual editor** — the third lane on the pipeline page.

---

## 1. Goals

1. A **Visual** representation of a pipeline that is richer and better laid out
   than the minimal sidebar diagram (`PipelineFlowDiagram`), usable as the primary
   way to read and edit a pipeline.
2. In **view mode**: a large, read-only diagram with the most important meta per
   node and a way to open a read-only config view per node.
3. In **edit mode**: the same diagram plus inline, contextual editing affordances:
   - Add input / output where missing.
   - Insertion points (a `+` circle) on the connecting lines to add a connector,
     cache, processor, etc. at that position.
   - Per-node meta + an **Edit** button that opens a dialog to edit that node's
     config.

### Non-goals / hard constraints

- **No drag-and-drop.** Layout and node identity are 100% **deterministic from
  the YAML state**. Re-parsing the same YAML always yields the same diagram. All
  mutations go through YAML; the diagram is a pure projection of it.
- We are **not** replacing the YAML editor. YAML remains the source of truth and
  its own lane. Visual edits mutate the YAML; switching to the YAML lane shows the
  result.
- We do not introduce a separate in-memory graph model that can drift from YAML.

---

## 2. Guiding principle: YAML is the single source of truth

```
                     parse (pure)            layout (pure)
   YAML string  ───────────────────▶  PipelineFlowNode[]  ──────────▶  React Flow nodes/edges
       ▲                                                                      │
       │                                                                      │ user action
       │              mutation helpers (pure: string ─▶ string)               ▼
       └──────────────────────────────────────────────  { type, path, payload }
```

- The diagram is derived from YAML via `parsePipelineFlowTree` →
  `computeTreeLayout` (both already exist and are pure). The visual editor reuses
  this pipeline; it does **not** fork the model.
- Every user action in the Visual lane produces a **YAML mutation** (a pure
  `string → string` transform), which is written back via the editor store's
  `setYamlContent`. The diagram then re-renders deterministically.
- This guarantees: undo/redo works through the existing Monaco history + store,
  the YAML and Visual lanes never disagree, and the diagram is testable as a pure
  function of YAML fixtures.

---

## 3. What already exists (reuse, don't rebuild)

| Concern | Existing asset | Location |
|---|---|---|
| Parse YAML → tree of nodes | `parsePipelineFlowTree`, `PipelineFlowNode` | `utils/pipeline-flow-parser.ts` |
| Deterministic layout (x/y, edges, collapse) | `computeTreeLayout`, `MAX_NESTING_DEPTH` | `utils/pipeline-flow-parser.ts` |
| Node rendering (section/group/leaf) | `pipelineNodeTypes`, `TreeLeafNode`, `TreeGroupNode`, `TreeSectionNode` | `pipeline-flow-nodes.tsx` |
| Edge rendering | `pipelineEdgeTypes` (`TreeEdge`, `SectionEdge`) | `pipeline-flow-nodes.tsx` |
| React Flow container, zoom, extent, scroll | `PipelineFlowDiagram` | `pipeline-flow-diagram.tsx` |
| Component logos | `ConnectorLogo` | `onboarding/connector-logo.tsx` |
| Docs links per connector | `getConnectorDocsUrl` | `pipeline-flow-nodes.tsx` |
| Connector picker (search + categories) | `AddConnectorDialog`, `ConnectTiles` | `onboarding/add-connector-dialog.tsx`, `onboarding/connect-tiles.tsx` |
| Add topic / add user flows | `AddTopicStep`, `AddUserStep`, `useDiagramDialogs` | `onboarding/`, `index.tsx` |
| Pipeline settings form | `ConfigDialog` (name/description/compute/tags) | `config-dialog.tsx` |
| Read-only details | `DetailsDialog` | `details-dialog.tsx` |
| Component schema (fields, types, required, advanced, descriptions) | `parseSchema`, `ConnectComponentSpec`, `RawFieldSpec` | `utils/schema.ts`, `types/schema.ts` |
| Template generation for a component | `getConnectTemplate`, `schemaToConfig`, `generateDefaultValue` | `utils/yaml.ts`, `utils/schema.ts` |
| Surgical redpanda patch (topic/SASL) | `patchRedpandaConfig`, `tryPatchRedpandaYaml`, `patchComponent` store action | `utils/yaml.ts`, `use-pipeline-editor-store.ts` |
| Runtime JSON schema for fields | `useGetPipelineServiceConfigSchemaQuery`, `parseYamlEditorSchema` | `index.tsx`, `react-query/api/connect.tsx` |
| Component list (inputs/outputs/processors/…) | `useListComponentsQuery` | `react-query/api/connect.tsx` |

### Gaps that must be built

The current mutation surface only supports **append/merge** and **surgical patch
of redpanda topic/SASL**. The visual editor needs positional and structural edits
that do **not** exist yet:

- ❌ Insert a processor at a specific index (not just append).
- ❌ Insert/add a resource (cache / rate_limit / buffer) from a `+` affordance.
- ❌ Set/replace a node's full config from an edit dialog.
- ❌ Remove a node.
- ❌ Reorder (lower priority; may stay YAML-only initially).
- ❌ A stable, reversible **path** from each visual node back into the YAML AST.

These are the core net-new pieces. They are detailed in §6 and §7.

---

## 4. Addressing edits: edit targets, not generic paths

Each `PipelineFlowNode` carries a **synthetic display id** (`proc-0`, `input-0`,
`proc-1-branch-p0`, …) that's great for rendering but says nothing about *where
in the YAML* the node lives. To edit a node we need that location.

The original design proposed a generic `path: (string|number)[]` on every node.
But a generic path only earns its keep when you edit **deeply nested** components
(a `mapping` inside a `branch` inside a `switch`). The editing we actually want
first — input, output, top-level processors, and array resources — lives at
flat, well-known locations. So instead of generic paths we attach a small
**`editTarget`** only to those top-level nodes:

```ts
type EditTarget =
  | { kind: 'input' }
  | { kind: 'output' }
  | { kind: 'processor'; index: number }
  | { kind: 'resource'; resourceKey: 'cache_resources' | 'rate_limit_resources'; index: number };
```

- `targetPath()` in `utils/yaml.ts` maps an `EditTarget` to a Document path
  (`['pipeline','processors',i]`, etc.) for `getIn`/`setIn`/`deleteIn`.
- Nodes with **no** `editTarget` (everything nested) stay read-only in the visual
  editor; they're still editable via the YAML lane. This is the deliberate scope
  boundary that lets us avoid the generic-path machinery entirely.
- Insertion points are addressed by **position** (`'start' | 'end'`) carried on
  the section-spine edges, resolved to a processor index at mutation time.

If/when nested editing is needed, `editTarget` can grow a `{ kind: 'path'; path }`
variant without disturbing the existing cases.

---

## 5. Feature requirements

### 5.1 View mode (read-only Visual lane)

- Large diagram filling the lane (reuse `PipelineFlowDiagram`'s container, with
  zoom controls visible — not `hideZoomControls`).
- Each node shows the **most important meta** for its kind (see §5.4).
- Each node has a way to open a **read-only config view** for that section (a
  dialog or side panel showing that component's YAML/fields). Reuse the read-only
  YAML viewer (`YamlViewPanel`'s Monaco read-only setup) scoped to the node's
  config, or a fields table built from the schema.
- No insertion points, no edit buttons.

### 5.2 Edit mode (interactive Visual lane)

All of view mode, plus:

1. **Add input / output when missing.** Placeholder nodes already render an
   `Add input` / `Add output` affordance (`TreeLeafNode` with `label === 'none'`
   and `onAddConnector`). In the Visual lane these open `AddConnectorDialog`
   filtered to `input` / `output`; selection calls `getConnectTemplate` and writes
   YAML (existing `handleConnectorSelected` path).

2. **Insertion points (`+` circle on connecting lines).** On each connecting line
   — primarily the section spine (`SectionEdge`) and between sibling
   processors/leaves — render a clickable circle-with-plus. Clicking opens a
   small **contextual menu** of what can be inserted *at that position*:
   - Between/around processors → **Add processor** (insert at that index), **Add
     cache** / **rate limit** / **buffer** (resources).
   - Above the first processor / on the INPUT→PROCESSORS spine → add processor at
     index 0, or add a resource.
   - The menu is position-aware: it only offers insertions valid for that slot.
   - Selecting a connector opens `AddConnectorDialog`/`ConnectTiles` filtered to
     the chosen type; selection generates a template and inserts it at the target
     path/index (see §6 new helpers).

3. **Per-node meta + Edit button.** Each card shows its key meta (§5.4) and an
   **Edit** button (visible on hover, like the existing docs-link button) that
   opens the **node config dialog** (§5.3) for that node's config.

4. **Remove node.** Each editable node offers a remove action (overflow menu or
   trailing icon) that deletes the node's path from the YAML
   (`deleteIn`). Guard against removing required singletons (input/output) — for
   those, removal converts back to the placeholder, or is disabled.

### 5.3 Node config dialog (schema-driven)

A dialog that edits one node's configuration:

- Resolve the node's `ConnectComponentSpec` from `useListComponentsQuery` +
  `parseSchema` by component name and type.
- Render a form from the component's `RawFieldSpec` tree: respect `optional`,
  `advanced` (collapsed by default), `defaultValue`, `description`/`summary` (help
  text), enums, and field `kind` (scalar/array/map/object).
- Prefer **react-hook-form + Zod** (project standard) with a schema derived from
  the field specs; fall back to a raw scoped-YAML editor for fields/components the
  form can't yet express (so nothing is uneditable).
- On submit: serialize the form back to a config object and **set it at the node's
  path** (`setIn`) — a localized replace, preserving the rest of the YAML.
- Topic/user sub-flows reuse `AddTopicStep` / `AddUserStep` and the existing
  `patchComponent` surgical patch where applicable (redpanda input/output).

This dialog is the editing counterpart to today's `ConfigDialog` (which stays
scoped to pipeline-level settings: name/description/compute/tags).

### 5.4 Meta shown per node ("most important field")

Define a small, schema-/heuristic-driven **summary extractor** that maps a
component to its one or two most salient fields. Initial mapping:

| Node kind / component | Primary meta |
|---|---|
| redpanda / kafka input/output | topic(s) (existing `topics` badge), SASL/user status (existing `missingSasl`) |
| Any connector with a `label` | the label (existing `labelText` badge) |
| `mapping` / `bloblang` | first line / truncated expression |
| `log` | `level` + truncated `message` |
| `branch` / `switch` / `workflow` | child/case/stage count (existing collapsed `childCount`) |
| `http_client` / HTTP-ish | `url` |
| cache resource | backend kind + `label` |
| generic | component `summary` from schema, else nothing |

Reuse the existing badge rows in `TreeLeafNode` (`labelText`, `topics`,
missing-config chips). Extend `PipelineFlowNode` with the extra summary fields the
extractor produces, mirroring how `labelText`/`topics` already flow through the
parser → node data → renderer. Keep it compact (≤2 rows) to preserve layout
determinism (`countLeafExtraRows`/`leafHeight` already accounts for extra rows —
update it if new row types are added).

---

## 6. New YAML mutation helpers (in `utils/yaml.ts`)

All pure `string → string` (or `string → string | null` on parse failure),
operating on a `yaml` `Document` so comments/formatting are preserved where
possible. Each is unit-tested against fixtures (mirror `yaml.test.tsx`).

```ts
// Insert a generated component template into a container at an index.
insertComponentAt(yaml, containerPath, index, componentName, type, components): string | null

// Replace the config at a node path with a new config object (from the edit dialog).
setComponentConfigAt(yaml, path, configObject): string | null

// Delete the node at a path (processor element, resource element, or input/output → placeholder).
removeComponentAt(yaml, path): string | null

// Add a resource (cache_resources / rate_limit_resources, or singletons buffer/metrics/tracer).
addResource(yaml, kind, componentName, components): string | null

// Optional / later: reorder a processor within its container.
moveComponent(yaml, containerPath, fromIndex, toIndex): string | null
```

Notes:
- Build on the existing `mergeConnectConfigs` / `getConnectTemplate` /
  `schemaToConfig` for template generation; the new part is **positional** insert
  and **path-targeted** set/delete via the Document API.
- For redpanda input/output topic/SASL edits, keep using the surgical
  `patchRedpandaConfig` / `patchComponent` path — don't regenerate the block.
- Insertion into multi-input/output arrays (broker `inputs[]`, switch `cases[]`,
  fallback `[]`) is **out of scope for v1** (read-only there); revisit later.

---

## 7. Component & file plan

New files under `pipeline/` (names indicative):

- `visual-editor-panel.tsx` — the interactive Visual lane (replaces the current
  `VisualEditorPanel` placeholder). Composes the diagram + insertion layer +
  toolbar. Read-only when `mode === 'view'`, interactive when editing.
- `visual-editor-flow.tsx` — wraps/extends `PipelineFlowDiagram` to inject
  insertion-point nodes/edges and per-node edit/remove callbacks. Keep the parser
  + layout as-is; add an overlay of `+` affordances driven by node `path`s.
- `node-inspector.tsx` — the persistent right-rail config editor (form vs. raw YAML).
- `node-meta.ts` — the summary extractor (§5.4): `getNodeSummary(spec, config)`.
- `insertion-points.ts` — derives valid insertion slots (`{ containerPath, index,
  allowedTypes }`) from the parsed tree.

Changes to existing files:

- `utils/pipeline-flow-parser.ts` — add `path` to `PipelineFlowNode`; populate it
  in every `parse*Nodes`/`make*` site. Optionally surface insertion slots.
- `pipeline-flow-nodes.tsx` — add an Edit button + remove action to leaf/group
  nodes (hover-revealed, `nodrag nopan`), and a new insertion-point node type.
- `utils/yaml.ts` — the new mutation helpers (§6).
- `index.tsx` — render `visual-editor-panel` instead of the placeholder when on
  the Visual lane; thread `setYamlContent`, `components`, schema, and the existing
  dialog hooks through.
- `use-pipeline-editor-store.ts` — add any Visual-specific UI state (e.g.,
  `activeNodeConfigPath`, insertion-menu state) following the existing dialog-flag
  pattern.

---

## 8. State management

- **Document state** stays in the editor store (`yamlContent`, `initialYaml`,
  `patchComponent`, `setYamlContent`). Visual edits call these — no new source of
  truth.
- **Visual UI state** (which node's config dialog is open, which insertion point's
  menu is open) lives in the store's UI slice, mirroring `isConfigDialogOpen` etc.
- The diagram derives everything else from `yamlContent` via the pure parser, so
  no synchronization code is needed.

---

## 9. Determinism & testing

- Parser + layout remain pure → snapshot/fixture tests map YAML → nodes/edges
  (extend `pipeline-flow-parser.test.tsx`).
- Each mutation helper is a pure function → fixture tests `inputYaml + action →
  expectedYaml` (extend `yaml.test.tsx`).
- Node-path correctness: tests asserting `getIn(doc, node.path)` returns the
  expected component for representative pipelines (flat, branched, multi-resource).
- Integration tests (`index.test.tsx` style): clicking a `+` opens the contextual
  menu; selecting a connector inserts it at the right index; Edit opens the dialog;
  saving the dialog updates the YAML lane; remove deletes the node.
- The existing tests already assert the Visual lane shows the placeholder and
  hides the sidebar diagram — update those as the panel is built.

---

## 10. Phased delivery

1. **M1 — Node paths.** Add `path` to `PipelineFlowNode` + tests. No UI change.
   Unblocks all editing.
2. **M2 — Large read-only Visual lane.** Render the full diagram in the lane with
   zoom; per-node read-only config view; richer meta (§5.4). View mode complete.
3. **M3 — Per-node Edit dialog.** Schema-driven `node-config-dialog` + `setIn`
   mutation; wire the Edit button. Edit existing nodes works end to end.
4. **M4 — Insertion points.** `+` affordances on lines, contextual insert menu,
   `insertComponentAt` / `addResource`, reusing `AddConnectorDialog`.
5. **M5 — Add input/output + remove.** Placeholder add flows in the lane; remove
   action; required-singleton guards.
6. **M6 (optional) — Reorder, multi-input/output array editing.**

Each milestone is independently shippable behind `enableRpcnVisualEditor`.

---

## 11. Open questions

- **Config dialog vs. side panel** for per-node editing — dialog is simpler and
  matches existing patterns; a docked side panel may scale better for large
  configs. Start with a dialog.
- **Fields the schema can't model** (custom/`unknown` components, free-form maps):
  confirm the scoped-YAML fallback is acceptable for v1.
- **Comment/formatting preservation** on `setIn`/`deleteIn` round-trips — how much
  do we guarantee? (The `yaml` Document API preserves most, but template
  regeneration does not.)
- **Resource placement UX** — do cache/rate_limit resources appear as their own
  "RESOURCES" section (they already do in the parser) with their own insertion
  point, or are they offered from the processor spine `+` menu? (Proposal: both —
  spine `+` can add a resource, and the RESOURCES section has its own `+`.)
- **Remove of input/output** — revert to placeholder vs. disabled. (Proposal:
  revert to placeholder so the section stays visible.)
```
