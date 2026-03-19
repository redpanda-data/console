# Plan: Slash Command Menu in Pipeline Editor

## Goal

Typing `/` in the YAML editor opens an inline command menu (popover at cursor) with the same content as the existing `Cmd+Shift+P` dialog. Refactor `PipelineCommandMenu` to support two rendering modes: `dialog` (current) and `popover` (new slash trigger).

---

## Architecture

### Variant Prop

```tsx
type PipelineCommandMenuProps = {
  variant: "dialog" | "popover";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editorInstance: editor.IStandaloneCodeEditor | null;
  hideInternal?: boolean;
  yamlContent?: string;
  // popover-only: pixel rect of cursor for positioning
  cursorRect?: { top: number; left: number; height: number } | null;
  // popover-only: text typed after `/` for filtering
  slashQuery?: string;
};
```

- `dialog` mode: wraps content in `CommandDialog` (current behavior, `Cmd+Shift+P`)
- `popover` mode: renders `Command` in a fixed-position container anchored to `cursorRect`

### Component Split

```
PipelineCommandMenu (variant='dialog'|'popover')
├── Dialog wrapper (variant='dialog')
│   ├── CommandDialog
│   │   ├── CommandInput (explicit search)
│   │   ├── ToggleGroup (category filters)
│   │   └── <CommandMenuContent />
│   ...
├── Positioned container (variant='popover')
│   ├── Command (standalone, no dialog)
│   │   ├── CommandInput (hidden, value driven by slashQuery)
│   │   └── <CommandMenuContent />   ← same shared component
│   ...
├── AddSecretsDialog (always dialog, both variants)
├── Topic Dialog (always dialog, both variants)
└── User Dialog (always dialog, both variants)
```

Extract `<CommandMenuContent />` — the `CommandList`, `CommandGroup`s, `CommandItem`s, `CommandEmpty`, and `CommandSeparator`s — into a shared internal component used by both variants.

---

## Implementation Steps

### Step 1: Extract Shared Content

In `pipeline-command-menu.tsx`:

1. Create `CommandMenuContent` — a pure render component receiving data + handlers:
   - `contextualVariables`, `secrets`, `allTopics`, `users` (data)
   - `handleSelect`, `openSubDialog` (callbacks)
   - `show`, `showSep` (filter helpers)
2. Both dialog and popover variants render `<CommandMenuContent />` inside their respective wrappers.
3. The toggle group (category filter) only renders in `dialog` variant. Popover variant relies on type-ahead filtering from cmdk.

### Step 2: Positioning via Monaco Content Widget

Instead of manual `position: fixed` + coordinate math, use Monaco's native **`IContentWidget`** system. This is exactly how Monaco's own autocomplete widget works.

**Why `IContentWidget` instead of manual positioning?**

1. **Auto-follows scroll** — no `onDidScrollChange` listener needed
2. **Built-in viewport clamping** — `[BELOW, ABOVE]` preference handles edge cases
3. **Works with `fixedOverflowWidgets: true`** — already enabled in our YamlEditor
4. **No coordinate math** — just provide `{ lineNumber, column }` and a preference
5. **No stale position bugs** — Monaco re-measures automatically

**API surface** (from `monaco.d.ts`):

```ts
interface IContentWidget {
  allowEditorOverflow?: boolean; // render outside editor bounds — YES
  suppressMouseDown?: boolean; // don't steal focus on click — YES
  getId(): string;
  getDomNode(): HTMLElement; // the DOM node Monaco will position
  getPosition(): IContentWidgetPosition | null;
  beforeRender?(): IDimension | null;
  afterRender?(position: ContentWidgetPositionPreference | null): void;
}

interface IContentWidgetPosition {
  position: IPosition | null; // anchor: { lineNumber, column }
  preference: ContentWidgetPositionPreference[]; // [BELOW, ABOVE]
}

enum ContentWidgetPositionPreference {
  EXACT = 0, // at the position
  ABOVE = 1, // above the line
  BELOW = 2, // below the line
}

// Editor methods:
editor.addContentWidget(widget); // register
editor.layoutContentWidget(widget); // re-measure (calls getPosition() again)
editor.removeContentWidget(widget); // cleanup
```

**Implementation in `useSlashCommand` hook:**

```ts
// Create a persistent DOM node for React portal target
const widgetDomRef = useRef(document.createElement("div"));

const widgetRef = useRef<editor.IContentWidget>({
  getId: () => "slash-command-widget",
  getDomNode: () => widgetDomRef.current,
  getPosition: () =>
    slashPositionRef.current
      ? {
          position: slashPositionRef.current,
          preference: [
            ContentWidgetPositionPreference.BELOW,
            ContentWidgetPositionPreference.ABOVE,
          ],
        }
      : null,
  allowEditorOverflow: true,
  suppressMouseDown: true,
});

// When slash is typed → add widget
editorInstance.addContentWidget(widgetRef.current);

// When menu closes → remove widget
editorInstance.removeContentWidget(widgetRef.current);
```

**In the popover variant rendering**, use `createPortal` to render into the widget DOM node:

```tsx
// In PipelineCommandMenu (variant='popover'):
{variant === 'popover' && open && widgetDom &&
  createPortal(
    <Command variant="elevated" size="sm" className="w-72 shadow-md">
      <CommandInput className="sr-only" value={slashQuery} />
      <CommandMenuContent ... />
    </Command>,
    widgetDom
  )
}
```

The hook exposes `widgetDomRef.current` so the parent can portal into it. No manual coordinates, no scroll listeners, no viewport math.

### Step 3: Slash Detection Hook — `useSlashCommand`

New hook in `pipeline/use-slash-command.ts`:

```tsx
function useSlashCommand(editorInstance: editor.IStandaloneCodeEditor | null) {
  const [isOpen, setIsOpen] = useState(false);
  const [cursorRect, setCursorRect] = useState<{...} | null>(null);
  const [slashQuery, setSlashQuery] = useState('');
  const slashPositionRef = useRef<Position | null>(null);

  useEffect(() => {
    if (!editorInstance) return;

    // 1. Detect `/` typed
    const disposable = editorInstance.onDidChangeModelContent((e) => {
      for (const change of e.changes) {
        if (change.text.includes('/')) {
          const position = editorInstance.getPosition();
          if (!position) continue;

          const model = editorInstance.getModel();
          const lineContent = model?.getLineContent(position.lineNumber) ?? '';
          const charBefore = lineContent[position.column - 2]; // char before `/`

          // Only trigger at start of line or after whitespace/colon
          if (position.column === 2 || /[\s:]/.test(charBefore)) {
            slashPositionRef.current = { ...position, column: position.column - 1 };
            setCursorRect(measureCursorRect(editorInstance, position));
            setSlashQuery('');
            setIsOpen(true);
          }
        }
      }
    });

    return () => disposable.dispose();
  }, [editorInstance]);

  // 2. Track typing after `/` to update slashQuery
  useEffect(() => {
    if (!editorInstance || !isOpen || !slashPositionRef.current) return;

    const disposable = editorInstance.onDidChangeModelContent(() => {
      const position = editorInstance.getPosition();
      const model = editorInstance.getModel();
      if (!position || !model) return;

      const slashPos = slashPositionRef.current!;
      // If cursor moved to different line or before slash, close
      if (position.lineNumber !== slashPos.lineNumber || position.column < slashPos.column) {
        setIsOpen(false);
        return;
      }

      // Extract text between `/` and cursor
      const lineContent = model.getLineContent(position.lineNumber);
      const query = lineContent.substring(slashPos.column, position.column - 1);
      setSlashQuery(query);
    });

    return () => disposable.dispose();
  }, [editorInstance, isOpen]);

  return { isOpen, setIsOpen, cursorRect, slashQuery, slashPositionRef };
}
```

**`measureCursorRect` helper:**

```ts
function measureCursorRect(
  editor: editor.IStandaloneCodeEditor,
  position: Position,
) {
  const scrolledPos = editor.getScrolledVisiblePosition(position);
  if (!scrolledPos) return null;

  const editorDom = editor.getDomNode();
  if (!editorDom) return null;

  const editorRect = editorDom.getBoundingClientRect();
  return {
    top: editorRect.top + scrolledPos.top,
    left: editorRect.left + scrolledPos.left,
    height: scrolledPos.height,
  };
}
```

### Step 4: Keyboard Interception via Context Keys

Use Monaco's **context key** system instead of raw `onKeyDown`. This is the same mechanism VS Code uses for conditional keybindings — cleaner, no `preventDefault`/`stopPropagation` juggling, and Monaco handles the priority resolution natively.

**API surface** (from `monaco.d.ts`):

```ts
// IStandaloneCodeEditor:
createContextKey<T>(key: string, defaultValue: T): IContextKey<T>
addCommand(keybinding: number, handler: ICommandHandler, context?: string): string | null

// IContextKey<T>:
set(value: T): void
reset(): void
get(): T | undefined

// KeyCode enum (relevant values):
KeyCode.Tab     = 2
KeyCode.Enter   = 3
KeyCode.Escape  = 9
KeyCode.UpArrow = 16
KeyCode.DownArrow = 18

// Context string is a "when clause" expression — same syntax as VS Code:
// 'slashMenuOpen'          → true when context key is truthy
// 'slashMenuOpen && !foo'  → compound expression
// '!suggestWidgetVisible'  → can negate built-in keys
```

**Implementation:**

```ts
// In useSlashCommand hook — create context key once when editor mounts
const contextKeyRef = useRef<editor.IContextKey<boolean> | null>(null);

useEffect(() => {
  if (!editorInstance) return;

  // Create the context key (idempotent — same key name reuses existing)
  contextKeyRef.current = editorInstance.createContextKey(
    "slashMenuOpen",
    false,
  );

  // Register commands that ONLY fire when slashMenuOpen is true.
  // The `context` parameter is a when-clause expression string.
  // These completely suppress the default editor behavior for these keys.
  const disposables = [
    editorInstance.addCommand(
      KeyCode.DownArrow,
      () => {
        forwardKeyToCommandMenu("ArrowDown");
      },
      "slashMenuOpen",
    ),

    editorInstance.addCommand(
      KeyCode.UpArrow,
      () => {
        forwardKeyToCommandMenu("ArrowUp");
      },
      "slashMenuOpen",
    ),

    editorInstance.addCommand(
      KeyCode.Enter,
      () => {
        selectCurrentItem();
      },
      "slashMenuOpen",
    ),

    editorInstance.addCommand(
      KeyCode.Escape,
      () => {
        closeSlashMenu();
      },
      "slashMenuOpen",
    ),

    editorInstance.addCommand(
      KeyCode.Tab,
      () => {
        selectCurrentItem();
      },
      "slashMenuOpen",
    ),
  ];

  return () => {
    contextKeyRef.current?.reset();
    for (const id of disposables) {
      // addCommand returns string | null — no dispose needed,
      // commands are scoped to editor lifetime
    }
  };
}, [editorInstance]);

// Toggle the context key when menu opens/closes
useEffect(() => {
  contextKeyRef.current?.set(isOpen);
}, [isOpen]);
```

**Why this is better than `onKeyDown`:**

| `onKeyDown` approach                               | Context Key approach                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| Must manually `preventDefault` + `stopPropagation` | Monaco suppresses default behavior automatically                               |
| Race condition with Monaco's own key handlers      | Monaco resolves priority natively — our handler wins when context is active    |
| Fires for ALL keystrokes, must filter              | Only fires for registered keybindings when context matches                     |
| Disposable management per open/close cycle         | Register once, toggle via context key boolean                                  |
| Can conflict with Monaco's suggest widget keys     | Can compose with built-in contexts: `'slashMenuOpen && !suggestWidgetVisible'` |

**Forwarding keys to cmdk:**

The `forwardKeyToCommandMenu` function dispatches a synthetic `KeyboardEvent` on the cmdk Command container DOM node:

```ts
const commandContainerRef = useRef<HTMLDivElement>(null);

function forwardKeyToCommandMenu(key: string) {
  commandContainerRef.current?.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true }),
  );
}
```

**`addCommand` return value note:** `addCommand` returns `string | null` (the command ID), not an `IDisposable`. Commands registered this way are bound to the editor instance lifetime and don't need manual disposal. However, if we need to unregister, we'd use `addAction` instead (which returns `IDisposable`).

**Alternative via `addAction`** (if we need disposable cleanup):

```ts
const disposable = editorInstance.addAction({
  id: "slash-menu-down",
  label: "Slash Menu: Next Item",
  keybindings: [KeyCode.DownArrow],
  precondition: "slashMenuOpen", // action is only enabled when true
  keybindingContext: "slashMenuOpen", // keybinding only active when true
  run: () => forwardKeyToCommandMenu("ArrowDown"),
});
// disposable.dispose() to unregister
```

`addAction` gives us both `precondition` (action enabled/disabled) and `keybindingContext` (keybinding active/inactive), plus returns a proper `IDisposable`. This is the recommended approach for lifecycle-managed bindings in React.

### Step 5: Selection Handler (Replace `/query` with Selected Text)

When the user selects an item from the slash popover:

```ts
const handleSlashSelect = (text: string) => {
  if (!editorInstance || !slashPositionRef.current) return;

  const slashPos = slashPositionRef.current;
  const currentPos = editorInstance.getPosition();
  if (!currentPos) return;

  // Replace from `/` through current cursor with selected text
  editorInstance.executeEdits("slash-command", [
    {
      range: {
        startLineNumber: slashPos.lineNumber,
        startColumn: slashPos.column, // the `/` character
        endLineNumber: currentPos.lineNumber,
        endColumn: currentPos.column, // end of typed query
      },
      text,
    },
  ]);

  setIsOpen(false);
  editorInstance.focus();
};
```

### Step 6: Wire Into `index.tsx`

```tsx
// In PipelinePage:
const { isOpen: isSlashMenuOpen, setIsOpen: setSlashMenuOpen, cursorRect, slashQuery, slashPositionRef }
  = useSlashCommand(editorInstance);

// Existing dialog menu (Cmd+Shift+P)
<PipelineCommandMenu
  variant="dialog"
  editorInstance={editorInstance}
  onOpenChange={setIsCommandMenuOpen}
  open={isCommandMenuOpen}
  yamlContent={yamlContent}
/>

// Slash-triggered popover menu
<PipelineCommandMenu
  variant="popover"
  cursorRect={cursorRect}
  editorInstance={editorInstance}
  onOpenChange={setSlashMenuOpen}
  open={isSlashMenuOpen}
  slashQuery={slashQuery}
  yamlContent={yamlContent}
/>
```

Both instances share the same data (secrets, topics, users, variables) fetched via hooks inside `PipelineCommandMenu`. React Query deduplicates the requests.

---

## Edge Cases

| Scenario                                                      | Behavior                                                                                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` typed inside a YAML string value (e.g., `path: /usr/bin`) | **Don't trigger** — only trigger when `/` is the first non-whitespace char after `: `, or at line start.                                                                        |
| User clicks elsewhere while popover is open                   | Close. Listen to `editor.onDidChangeCursorPosition` — close if line changes or column moves before slash position.                                                              |
| Editor scrolls while popover is open                          | **Handled automatically by `IContentWidget`** — Monaco repositions the widget on scroll. No manual listener needed.                                                             |
| Popover would render off-screen                               | **Handled automatically** — `preference: [BELOW, ABOVE]` tells Monaco to try below first, flip above if no room. `allowEditorOverflow: true` lets it extend past editor bounds. |
| Sub-dialog opened from popover (create secret/topic/user)     | Close popover, open sub-dialog. On sub-dialog close, reopen popover with pending search. Same flow as dialog variant.                                                           |
| User presses Backspace to delete `/`                          | `slashQuery` tracking detects cursor before slash position → close popover. Triggers `removeContentWidget`.                                                                     |
| Multiple `/` characters on same line                          | Only the last one triggers the popover. Previous ones are inert.                                                                                                                |
| Monaco's own suggest widget opens while slash menu is open    | Close slash menu. Can use built-in context key `suggestWidgetVisible` in compound expression: `'slashMenuOpen && !suggestWidgetVisible'`.                                       |

---

## Resolved Decisions

1. **Trigger character:** `/` — only trigger at line start or after `: ` (whitespace/colon context). This avoids conflict with YAML paths like `path: /usr/bin` since those appear mid-value, not after `: `.

2. **ToggleGroup in popover:** No. Popover uses cmdk type-ahead only. Make `showCategoryFilter` a prop on the shared `CommandMenuContent` — `true` for dialog, `false` for popover. Category group headings still render.

3. **"Create new" actions in popover:** Yes, include them. They close the popover and open sub-dialogs, same flow as dialog variant.

---

## Deep Dive: Focus Management

The core tension: **Monaco must retain focus** (user is typing to filter), but **cmdk expects its `CommandInput` to be focused** (for keyboard nav and filtering).

### How cmdk works internally

cmdk (`CommandPrimitive`) uses a `<input>` element for:

1. **Filtering** — `input.value` drives the internal `search` state, which filters items
2. **Keyboard nav** — `onKeyDown` on the input handles ArrowUp/ArrowDown/Enter

If the input isn't focused, neither filtering nor keyboard nav works out of the box.

### Solution: Drive cmdk externally, bypass its input

cmdk's `Command` component accepts a `filter` function and the `CommandInput` accepts a controlled `value` prop. We can:

**Option A — Controlled `CommandInput` with `value` prop (recommended):**

```tsx
// slashQuery comes from useSlashCommand hook (text typed after `/`)
<Command>
  <CommandInput
    value={slashQuery}
    // Don't render visually — filtering driven by Monaco typing
    className="sr-only"
    // Prevent cmdk from trying to focus this
    tabIndex={-1}
    autoFocus={false}
  />
  <CommandList>
    <CommandMenuContent ... />
  </CommandList>
</Command>
```

cmdk's `CommandInput` uses a controlled `value` prop internally — when `slashQuery` updates (from Monaco keystrokes), cmdk re-filters automatically. The input exists in the DOM for cmdk's internal `search` context, but it's visually hidden and never focused.

**Keyboard nav is handled by our `addAction` commands** (Step 4) — they intercept ArrowUp/ArrowDown/Enter in Monaco and forward synthetic events to the Command container. cmdk picks these up because it uses a `keydown` listener on the root `[cmdk-root]` element, not just the input.

**Option B — Custom `filter` on `Command`:**

```tsx
<Command
  filter={(value, search) => {
    // Custom filtering using slashQuery instead of input value
    if (!slashQuery) return 1;
    return value.toLowerCase().includes(slashQuery.toLowerCase()) ? 1 : 0;
  }}
>
  {/* No CommandInput at all */}
  <CommandList>...</CommandList>
</Command>
```

This bypasses cmdk's input entirely. But cmdk still needs `search` state for its filtering — without `CommandInput`, the `filter` function receives empty `search`. We'd need to also set `value` on the Command root:

```tsx
<Command value={slashQuery} filter={...}>
```

Wait — `Command`'s `value` prop controls the **selected item**, not the search. So Option A (controlled `CommandInput`) is cleaner.

### Recommendation: Option A

1. Render `CommandInput` with `value={slashQuery}` and `className="sr-only"`
2. Monaco retains focus — user types normally, `onDidChangeModelContent` updates `slashQuery`
3. cmdk filters based on the controlled input value
4. Arrow/Enter/Escape handled via `addAction` context key commands → forwarded to cmdk root
5. `suppressMouseDown: true` on the content widget prevents clicks on menu items from stealing Monaco focus — but we need to handle item selection via click too:

```tsx
// On CommandItem click: still works because onClick fires even with suppressMouseDown
// (suppressMouseDown calls preventDefault on mousedown, not click)
<CommandItem onSelect={() => handleSlashSelect(text)}>
```

### Focus flow summary

```
User types `/sec` in Monaco:
  └─ Monaco has focus throughout
  └─ onDidChangeModelContent fires
  └─ slashQuery = "sec"
  └─ CommandInput value="sec" (sr-only, not focused)
  └─ cmdk filters items to secrets matching "sec"

User presses ArrowDown:
  └─ Monaco intercepts via addAction (precondition: slashMenuOpen)
  └─ Default cursor movement suppressed
  └─ Synthetic KeyboardEvent('ArrowDown') dispatched on [cmdk-root]
  └─ cmdk highlights next item

User presses Enter:
  └─ Monaco intercepts via addAction
  └─ selectCurrentItem() called
  └─ handleSlashSelect replaces `/sec` with `${secrets.my-secret}`
  └─ Content widget removed, context key set to false
  └─ Monaco retains focus, cursor at end of inserted text
```
