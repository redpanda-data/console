# Redpanda Connect pipeline drafts

Spec and decision record for saving a pipeline without deploying it.

Touches two repos: the API contract and client live here (`proto/redpanda/api/dataplane/v1/pipeline.proto`,
`frontend/src/components/pages/rp-connect/`), and `PipelineService` lives in `cloudv2`
(`apps/redpanda-connect-api/internal/pipeline/pipeline_v1.go`).

## The problem

Save meant Start, and Save was gated on validation.

1. **Work in progress could not be parked.** An invalid config would not save at all, so a refresh, a
   session timeout or a misclicked Back button lost everything typed. The config is usually invalid
   halfway through writing it — that is not an error state, it is the normal state of unfinished work.
2. **A finished config could not be saved without going live.** Every save on an existing pipeline was
   an immediate deploy, which for a running pipeline means a restart and dropped in-flight messages.

An earlier pass on this branch worked around (1) with `localStorage` drafts, because the dataplane
rejected an unlintable config on both create and update, so a half-written pipeline could not be
stored server-side at all. That is now fixed at the source: this spec replaces browser-local drafts
with a real draft state, and keeps the local store for what it is actually good at — crash recovery.

## What ships

| | Draft | Autosave buffer |
|---|---|---|
| Purpose | Deliberately parking work | Not losing work to a crash or a closed tab |
| Where | Server, a pipeline in `STATE_DRAFT` | `localStorage`, one buffer per editor target |
| Created by | Clicking **Save draft** | Typing (debounced) |
| Visible to | Everyone who can see pipelines | Only this browser profile |
| Lifetime | Until started or deleted | Until the next successful save |
| In the pipeline list | Yes, as a row with a Draft chip | No |

Both ship. A draft is a decision; an autosave buffer is a safety net. Neither substitutes for the other:
a draft cannot protect the thirty seconds since your last click, and an autosave buffer cannot be
picked up by a teammate or seen by Support.

## Decisions

### 1. A draft is a distinct state, not a "has unapplied changes" flag

`Pipeline.State.STATE_DRAFT = 7`.

The two model different things. "Has unapplied changes" is a property of a deployed pipeline: a diff
between what is running and what someone has typed. A draft is a lifecycle stage: nothing has ever
been deployed, and there may be nothing deployable. Modeling a draft as a property has nowhere to
hang — for a brand-new pipeline there is no deployed object to attach it to.

Consequences accepted:

- A draft is a `Pipeline`, so it appears in the pipeline list, has one detail route, one editor, one
  set of permissions, and is started with the existing `StartPipeline`. No parallel resource type, no
  second list to merge, no new RBAC surface.
- `STATE_DRAFT` is a new enum value, and old clients render unknown states badly (the self-hosted
  console shows a red "Unknown"). So drafts are **excluded from `ListPipelines` unless
  `Filter.include_drafts` is set** — including when `states` names `STATE_DRAFT` explicitly. A client
  that predates drafts lists with no filter at all and never sees one.

"Unapplied changes on a running pipeline" is a **documented follow-on** — see §8.

### 2. Storage: an annotation, not a CRD field

A draft is `metadata.annotations["connect.redpanda.com/draft"] = "true"` plus `spec.paused = true`.

The CRD has a structural schema, so a field it does not declare is pruned on write. The CRD is
installed by each cloud provisioner (`terraform/provisioners/{aws,gcp,azure}-redpanda*/…-crd.yaml`),
independently of this service. A new `spec.draft` field would therefore be silently dropped on any
cluster whose CRD had not been updated yet, producing a "draft" that is unpaused and deploys itself.
Annotations are never pruned, so drafts work the moment the service rolls out, with no CRD, helm or
terraform change.

Six annotations already carry service state on these objects (`…/suspended`, `…/last-paused-value`,
`…/organization_id`, …), so this is the established mechanism, not a workaround invented here.

`spec.paused = true` is belt and braces: the annotation is what the service reads, `paused` is what
stops the controller ever scheduling a pod. A draft that somehow lost its annotation would be a
stopped pipeline, not a running one.

### 3. Validation is skipped for a draft and enforced on start

- `CreatePipeline` with `draft: true` stores `config_yaml` byte-for-byte, no lint, empty allowed.
- `UpdatePipeline` on a stored draft does the same.
- `StartPipeline` on a draft lints first. On failure it returns `INVALID_ARGUMENT` with one `LintHint`
  per problem — the same shape create already returned, so the editor's existing line-anchoring works
  unchanged — and **the draft is left exactly as it was**. One JSON patch clears the annotation and
  unpauses, so a draft either becomes a running pipeline or stays a draft; there is no in-between.
- Everything that is not a draft is still validated on every write. Relaxing this for drafts must not
  relax it for pipelines that run.

An empty config is refused on start with a sentence rather than a field path, carrying
`REASON_CONNECT_INVALID_PIPELINE_CONFIGURATION` so clients classify it as "not deployable yet". This
replaced the field-level `required` rule on `config_yaml`, whose message was the raw proto path
(`request.pipeline.config_yaml: value is required`) — the client used to special-case it.

Resource sizing (compute units) is **still validated for drafts**. It is a number in a form, not a
half-written document: the user can fix it in the settings dialog immediately, and the client already
clamps to the allowed range.

### 4. Default primary button for a new pipeline: **Save draft**

Create used to start the pipeline; an earlier pass on this branch changed it to deploy-but-stopped.
With a real draft state, both are wrong as a default.

| Context | Primary | In the split menu |
|---|---|---|
| New pipeline | `Save draft` | `Save and start` |
| Draft | `Save draft` | `Save and start` |
| Stopped pipeline | `Save` | `Save and start` |
| Running pipeline | `Apply and restart` | `Save and stop` |

Why `Save draft` leads on a new pipeline:

- It is the only action that always succeeds. A primary button that fails on incomplete input teaches
  people not to click it, which is how work gets lost.
- It starts nothing. Starting a pipeline has irreversible side effects — consumer offsets move, sinks
  are written to, money is spent — and the user who was still typing did not ask for any of them.
- Deploy-but-stopped, the previous default, no longer has a purpose: a draft is also saved-and-not-
  running, and it does not need to be valid first.
- Precedent for save-vs-publish being separate and save being the default: n8n, Fivetran (paused by
  default), GCP Datastream (Create vs Create & start).

**Running pipelines are the honest exception.** There is no pending-revision support, so saving a
running pipeline necessarily restarts it. The button says `Apply and restart` rather than hiding that
behind the word "Save". Making this non-destructive is §8.

### 5. Drafts count against the pipeline quota

The quota is a Kubernetes object-count quota (`count/pipelines.connect.redpanda.com`, default 100),
keyed to a resource kind. A draft is a pipeline object, so it consumes one — there is no way to give
drafts a separate budget without a separate kind, and a separate kind means a new CRD duplicated
across three terraform provisioners plus a helm `ResourceQuota` change, i.e. an infra rollout, not an
API change.

Accepted rather than worked around, because the alternative is worse than the cost: a tenant at 100
pipelines cannot create a draft, and gets `RESOURCE_EXHAUSTED` with the same message they already get
for a pipeline. Drafts use no compute, so this is an object-accounting limit, not a spend limit.

Follow-on if it bites: a separate `max_pipeline_drafts` quota needs the separate-kind change above.

### 6. Naming: a draft must be named, and names may collide

- **Named**: same rule as any pipeline (3–128 chars, `[A-Za-z0-9-_ /]`). Relaxing this would weaken
  `Pipeline.display_name` for every existing client — terraform, rpk, the self-hosted console — so
  that a draft can be nameless. Not worth it.
- **Never a blocker**: the client fills in `Untitled pipeline`, `Untitled pipeline 2`, … when the name
  field is empty at save time, so "save what I typed" never stops to ask for a name. It is a legal
  display name, and the editor's name field is right there to change it.
- **Collisions allowed**: display names are already not unique server-side (identity is the id), and
  refusing a duplicate would be a new restriction invented for drafts alone. Two drafts called
  `Untitled pipeline` is a normal outcome of parking work twice.

### 7. Visibility: org-wide, like every other pipeline

A draft is visible to everyone who can see pipelines, and editable by anyone who can edit them.

Not a choice so much as the truth: pipeline permissions are cluster-wide with no ownership predicate,
so "private until started" could not be enforced — it would only be hidden, and anyone with edit
permission could still change or delete it. Showing a private badge over a shared mutable object is
worse than showing nothing.

To keep a shared pool from being an anonymous one, `Pipeline.created_by` now records the principal
that created a pipeline (`connect.redpanda.com/created-by`, email or service-account identifier). The
list shows it on draft rows. It attributes, it does not restrict, and the field comment says so.

Follow-on: a "My drafts" filter, and per-owner permissions, would build on `created_by`.

### 8. Retention: drafts do not expire

No timer deletes a draft.

- There is no reaper in the connect API to hang an expiry on, and deleting a user's saved work on a
  schedule needs a warning path, a grace period and a restore story — a feature in itself, not a
  footnote to this one.
- Silent expiry is exactly the data loss this feature exists to stop.

What ships instead of expiry is **visible staleness**, so an abandoned draft is obvious rather than
quietly deleted: `Pipeline.create_time` (from the CR's `creationTimestamp`) and
`Pipeline.update_time` (`connect.redpanda.com/updated-at`, stamped on every write — starting and
stopping do not count as edits). The list sorts drafts by last edited and labels them "Edited 3
months ago". A stale draft is one row and one menu click from gone.

The CR had no edit timestamp of its own: `PipelineStatus.LastUpdateTime` moves on phase transitions,
so it answers "when did it last change state", not "when was it last edited".

### 8b. A draft ends at first start — and that is the feature's real limit

Worth stating plainly, because it is the difference between what the ticket asked for and what this
delivers:

| Editing | Primary | In the menu | Can it be a draft? |
|---|---|---|---|
| New pipeline | **Save draft** | Save and start | Yes — validity is irrelevant |
| A draft | **Save draft** | Save and start | Yes, stays one |
| Deployed + stopped | **Save** (applies, stays stopped) | Save and start | **No** |
| Deployed + running | **Apply and restart** | Save and stop | **No** |

`StartPipeline` on a draft is a one-way door: `PipelineUpdate.draft` is refused on a deployed pipeline,
so nothing can go back to being a draft. That means the ticket's second complaint — "a finished config
cannot be saved without going live" — is **solved for pipelines that have never run and unsolved for
the ones that have**. A stopped pipeline can at least be saved without starting; a running one cannot
be saved at all without restarting, and its only protection is the browser-local recovery buffer.

Closing that gap is §9, and it is the next thing worth building.

### 8c. The Changes lane

A third editor lane, `YAML | Visual | Changes N`, comparing the saved configuration with the editor
buffer: a line diff (Monaco's diff editor, unchanged regions collapsed) beside a list of the components
touched, each Added / Removed / Changed and clickable to jump to its lines in the YAML lane. The count
on the tab is components touched, so a change is visible without opening the lane.

The header line says what applying will cost, and it is the only place that difference is stated:
"not live … applying restarts the pipeline, which drops in-flight messages" for a running pipeline,
"not saved to the pipeline yet" for a stopped one, "aren't saved to the draft yet" for a draft.

This is deliberately console-only — it needs no proto, no service and no rollout, and it makes the
existing `Apply and restart` inspectable rather than a leap of faith. It does **not** stage anything:
the comparison is against what is saved, and the only saves available are still the ones in the table
above.

Editing a **running** pipeline still applies immediately and restarts it. What is not built:

- **Pending revision** — save an edit against a running pipeline and apply it later on an explicit
  action. Needs a second config stored per pipeline, an apply/discard UI, and an answer for what a
  restart (crash, version rollout, tenant resume) does to a pending revision: nothing, it must never
  be applied implicitly.

  Storage has three shapes, and the choice is the whole decision: an **annotation**
  (`connect.redpanda.com/pending-config`) like the draft flag, which needs no CRD change and works on
  every existing cluster but must stay under the 256 KB annotation ceiling — fine for configs whose
  median is 767 B and max seen is 30 KB, with a guard; **`spec.pendingConfig`** in the CRD, cleaner but
  an infra rollout across three provisioners plus a pruning window where a pending config silently
  vanishes; or **draft copies** pointing at a parent, which needs no storage change but spends a quota
  slot per staged change and lets someone hit Start on the copy and get a second running pipeline.
  The annotation is the recommendation: one pipeline, one pending change, apply or discard.

  Do it at the same time as exposing an `etag` from `metadata.generation` (free, exact, already on the
  CR). Two people staging changes on one pipeline is otherwise silently last-write-wins, and that
  matters more once two configs are in play than it does today.
- **Revision history / revert to previous** — needs config versions retained per pipeline plus an
  `etag` for concurrency. The `Pipeline` resource has no `etag` today, so two people editing one
  pipeline is silently last-write-wins; holding several versions widens that window rather than
  closing it.

What covers the gap meanwhile: the autosave buffer keeps unapplied edits to a running pipeline in the
browser and offers to restore them, and `Apply and restart` says what it does.

`PipelineUpdate.draft` exists partly to keep this gap safe. It is an **assertion**, not a transition:
setting it to `true` means "I am editing a draft", and the update fails with `FAILED_PRECONDITION` if
the pipeline has since been started — so "Save draft" can never silently deploy to a running pipeline
because a teammate started it while you were typing. Setting it to `false` is refused; promotion goes
through `StartPipeline` so the config is validated first.

## API changes

`proto/redpanda/api/dataplane/v1/pipeline.proto`, all additive (`buf breaking` clean against master):

| Change | Field | Notes |
|---|---|---|
| `Pipeline.State.STATE_DRAFT` | `7` | Excluded from list results by default |
| `PipelineCreate.draft` | `9` | `bool` — save without deploying or validating |
| `PipelineUpdate.draft` | `9` | `optional bool` — assertion, presence matters |
| `ListPipelinesRequest.Filter.states` | `4` | `repeated Pipeline.State` — empty means every state |
| `ListPipelinesRequest.Filter.include_drafts` | `5` | `bool` — drafts are opt-in |
| `Pipeline.created_by` | `13` | `OUTPUT_ONLY`, attribution only |
| `Pipeline.create_time` | `14` | `OUTPUT_ONLY` |
| `Pipeline.update_time` | `15` | `OUTPUT_ONLY`, spec writes only |

Also: `config_yaml` lost its field-level `required` rule on `Pipeline`, `PipelineCreate` and
`PipelineUpdate` (§3). `Pipeline` keeps the invariant as a message-level CEL rule
(`state == STATE_DRAFT || config_yaml != ''`), which is the one place it is decidable from the message
alone.

### Rollout order

Three repos, not two, because in Cloud the console frontend does not talk to the dataplane directly:

```
console frontend ──► console-enterprise backend ──► redpanda-connect-api (cloudv2)
                     (proxies via github.com/redpanda-data/console/backend's
                      generated dataplane types)
```

`console-enterprise`'s pipeline service is a pure pass-through (`s.targetClient.CreatePipeline(ctx, req)`),
but it unmarshals into the generated types from this repo's `backend/pkg/protogen`. Connect's JSON
codec **discards** unknown fields rather than preserving them the way the binary codec does, so a
`draft: true` sent through a proxy compiled against an older proto is silently dropped — the pipeline
is then created for real and validated, which is exactly the failure the flag exists to prevent.

So: regenerating `backend/pkg/protogen` is **required**, not optional, even though no Go code in this
repo implements `PipelineService`.

1. Proto lands here, with **both** `frontend/src/protogen` and `backend/pkg/protogen` regenerated.
   `buf generate --template=buf.gen.backend.yaml` alone rewrites import grouping across ~200 files;
   follow it with `goimports -w -local "github.com/redpanda-data/console/backend" pkg/protogen`
   (what `task backend:fmt` does) and the diff collapses to just the changed proto.
2. Published to the BSR.
3. `DATAPLANE_BUF_API_VERSION` bumped in `cloudv2`, `redpanda-connect-api` deployed.
4. `console-enterprise` picks up the new `github.com/redpanda-data/console/backend` module version.
5. Only then flip `enable-rpcn-pipeline-drafts` in LaunchDarkly.

The flag is forwarded to the embedded console by cloud-ui's `useConsoleFeatureFlags`, which passes an
explicit allow-list — a console flag missing from that list can never be turned on in Cloud.

## Flows

### Create as draft

1. `/rp-connect/create`, type a partial config. Header shows **New**.
2. **Save draft** (primary). Empty name is filled in as `Untitled pipeline` (numbered past the names
   already taken).
3. `CreatePipeline{draft: true}` → `/rp-connect/<id>/edit`. Parking work is a "keep working" action, so
   it stays in the editor — but on the draft's own route, so the next save updates this draft instead
   of forking another one. Every later draft save stays put entirely.
4. Toast: "Draft saved. It isn't running yet." The autosave buffer for `create` is cleared.

### Resume a draft

1. Pipeline list → **Drafts** tab, or the row's Draft chip anywhere in the list.
2. Row click → `/rp-connect/<id>`, the draft's own page: it says what a draft is, and offers **Continue
   editing** and **Start pipeline** rather than dropping straight into the editor. A row click is a
   "show me this" gesture, and a draft's page is also where Start and Delete live.
3. **Continue editing** → `/rp-connect/<id>/edit`, config exactly as saved.
4. Header shows **Draft** and, if it does not lint, "N issues to fix before this can start".

### Start a draft

From the list row menu (**Start**) or the draft's detail page (**Start pipeline**).

- Lints clean → `STARTING`, chip changes, toast "Pipeline starting".
- Does not lint → nothing starts; the editor opens, with each problem listed as `Line N, Col N: …` in
  the lint panel and its node marked in the structure tree, plus a toast saying how many issues block
  the start. The draft is untouched.

Starting from the list on an invalid draft routes into the editor rather than showing an error toast
and leaving the user on the list: the errors are only actionable in the editor.

### Draft with validation errors

Lint results are **warnings on a draft and errors on a start**. The lint panel and the structure tree
mark them the same way as always; what changes is that they no longer block Save draft. The Start
action stays enabled and reports the problems when clicked — a disabled Start with no explanation is
how users conclude the feature is broken.

### Unsaved changes

Navigating away with unsaved edits opens the existing dialog, now offering **Save draft** on a draft
or new pipeline (and **Discard** / **Keep editing** as before). On a running pipeline the primary
becomes **Keep editing**, because the only "save" available there would restart it.

Closing the tab is covered by autosave, not the dialog: the buffer is written on a debounce, and the
next visit to that editor offers to restore it.

## Pipeline list treatment

- **Chip**: `Draft` in the Status column, muted, tooltip "Saved but never deployed — uses no compute".
- **Tabs**: a `Drafts` tab beside All / Running / Stopped / Error, with a count. Hidden at zero.
- **Sort**: drafts sort first in the default status order — they are the rows with work still owed —
  and among themselves by last edited, so the one being worked on is at the top.
- **Row**: name links to the pipeline's page; subtitle "Edited 5m ago · by someone@example.com" in
  place of the id, since who parked it and how long ago is what decides whether to pick it up.
- **Actions**: Continue editing · Start · Delete. No Stop (nothing is running).
- **Empty states**: All tab with nothing at all → the existing "You have no Redpanda Connect
  pipelines". Drafts tab at zero is unreachable (the tab hides), but the string exists for a filtered
  Drafts view: "No drafts match the current filters".
- **Error states**: unchanged — a failed first page replaces the table, a failed background refresh
  shows a stale-data line under it. A draft that fails to start reports through the editor, not the
  row.

## Acceptance criteria

| Criterion | Covered by |
|---|---|
| Partial, invalid config saves; navigate away and return to exactly what was typed | `TestService_CreatePipeline_DraftSkipsValidation` (byte-for-byte, incl. empty and whitespace-only); `save-actions.test.ts`; `index.test.tsx` round-trip |
| A complete valid config saves with zero data processed | Draft is `paused` + annotated, asserted in the same test; billing meters pod runtime, and a draft has no pods |
| Start a draft from the list and from the detail view | `list.test.tsx` row action; `index.test.tsx` detail action; `TestService_StartPipeline_Draft` |
| Starting an invalid draft shows line-anchored errors and does not start it | `TestService_StartPipeline_Draft/refuses an invalid draft and leaves it alone` (LintHints present, annotation and `paused` unchanged); `index.test.tsx` lint routing |
| Refreshing mid-edit does not silently discard editor content | `rpcn-editor-autosave.test.tsx`; restore notice in `index.test.tsx` |
