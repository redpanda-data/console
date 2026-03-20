# Pipeline View Mode Redesign Plan

## 1. Log Explorer — default live mode ON

**File:** `src/components/ui/connect/log-explorer.tsx`

- Change `useState(false)` → `useState(true)` on line 211

---

## 2. Throughput card — replace DropdownMenu with Select

**File:** `src/components/pages/rp-connect/pipeline/pipeline-throughput-card.tsx`

- Replace `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuCheckboxItem` with `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`
- Bind `value={selectedTimeRange}` / `onValueChange={setSelectedTimeRange}`
- Use `size="sm"` on SelectTrigger

---

## 3. Throughput card — add refresh button left of time Select

**File:** `src/components/pages/rp-connect/pipeline/pipeline-throughput-card.tsx`

- Import `RefreshCcw` from lucide-react
- Add `useQueryClient` from `@tanstack/react-query`
- Add a ghost icon Button with `<RefreshCcw />` to the left of the Select
- onClick: invalidate the two range query keys to refetch ingress/egress data
- Disable while loading

---

## 4. Toolbar — restructure for view mode

**File:** `src/components/pages/rp-connect/pipeline/toolbar.tsx`

Current view-mode layout:

```
[← Back] [Pipeline Name] [EditIcon]          [StatusBadge] [Start/Stop]
```

New view-mode layout:

```
[← Back] [Pipeline Name] [GearIcon]                           [Edit ▸ primary]
         "Your command center for monitoring pipeline status"
         [StatusBadge] [Start/Stop ▸ secondary-outline]
```

Changes:

- When `mode === 'view'`: wrap left side in a `flex-col` to stack name row + description + status row
- Below name: add `<Text className="text-muted-foreground" variant="bodySmall">` with descriptive text
- Below description: render `StatusBadge` + `PipelineActionButton` in a row
  - Change `PipelineActionButton` button variant to `"secondary-outline"` (pass variant prop)
- Right side: render only the **Edit** button (navigates to `/rp-connect/{id}/edit`) as primary `<Button>`
- Next to pipeline name: replace `EditIcon` with `SettingsIcon` (gear), wire `onClick` to new `onViewConfig` prop (instead of navigating to edit)

### New toolbar prop

- Add `onViewConfig?: () => void` — opens the view-mode metadata dialog

---

## 5. View-mode metadata dialog

**File:** `src/components/pages/rp-connect/pipeline/view-details-dialog.tsx` (new file)

- Create `ViewDetailsDialog` component
- Props: `{ open: boolean; onOpenChange: (open: boolean) => void; pipeline?: Pipeline; onDelete?: (id: string) => void; isDeleting?: boolean }`
- Renders a `Dialog` with `size="full"`
- Content: reuse the same markup from `ViewDetails` (Pipeline card, References card, Delete/Danger zone card)
  - Import and reuse `DetailRow`, secrets/topics/tags logic
  - Or import `ViewDetails` directly and render it inside the dialog body

---

## 6. Wire it up in index.tsx

**File:** `src/components/pages/rp-connect/pipeline/index.tsx`

- Add `isViewConfigDialogOpen` state
- Pass `onViewConfig={() => setIsViewConfigDialogOpen(true)}` to `<Toolbar />`
- Render `<ViewDetailsDialog>` with pipeline, onDelete, isDeleting props
- The `ViewDetails` component in the left panel can remain as-is (it's in the resizable panel for view mode) or be simplified since the metadata now lives in the dialog — **keep as-is for now** to avoid scope creep

---

## Unresolved Questions

1. Should the `ViewDetails` panel content be reduced now that metadata is accessible via the gear dialog? (e.g., remove Pipeline/References cards from the left panel, keep only throughput?)
   yeah remove the pipeline and references card from the main section
2. Should the `PipelineActionButton` dropdown variants (Starting/Stopping/Error) also use `secondary-outline`, or only the simple Start/Stop button?
   did it for you, don't worry about it
3. Exact description text — "Your command center for monitoring pipeline status and performance" or something else?
   use that for now, I'll ask marketing what they want
