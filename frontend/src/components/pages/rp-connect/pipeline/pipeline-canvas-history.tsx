import { Kbd } from 'components/redpanda-ui/components/kbd';
import { useCallback, useEffect } from 'react';
import { formatShortcut, modKey, shiftKey } from 'utils/shortcuts';

import { usePipelineEditorStore } from './use-pipeline-editor-store';
export const UNDO_SHORTCUT = formatShortcut(modKey(), 'Z');
export const REDO_SHORTCUT = formatShortcut(modKey(), shiftKey(), 'Z');

export const ShortcutLabel = ({ label, keys }: { label: string; keys: string }) => (
  <span className="flex items-center gap-2">
    {label}
    <Kbd size="xs" variant="filled">
      {keys}
    </Kbd>
  </span>
);

// Classify a canvas keydown; presses inside text fields / Monaco keep their own editing semantics.
export type CanvasKeyAction = 'undo' | 'redo' | 'deselect' | 'delete' | 'palette';

// Focused controls own their keys: text fields / Monaco keep editing semantics, and buttons, selects,
// switches, radios, menus and our popovers (not any role="dialog", which a host shell's own dialog would
// match) must not have Delete open the confirm dialog or `/` open the palette.
const FOCUS_GUARD_SELECTOR =
  'input, textarea, select, button, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="menu"], [role="switch"], [role="radio"], [role="checkbox"], [data-slot="popover-content"], .monaco-editor';

// Unmodified canvas keys: `/` opens the palette, Escape deselects, Delete/Backspace deletes.
function plainCanvasKeyAction(e: KeyboardEvent): CanvasKeyAction | null {
  // `/` opens the palette — ⌘K is taken by the outer app-shell search.
  if (e.key === '/' && !(e.metaKey || e.ctrlKey || e.altKey)) {
    return 'palette';
  }
  if (e.key === 'Escape') {
    return 'deselect';
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    return 'delete';
  }
  return null;
}

// History chords: ⌘Z undoes, ⌘⇧Z / ⌘Y redo.
function historyKeyAction(e: KeyboardEvent): CanvasKeyAction | null {
  if (!(e.metaKey || e.ctrlKey)) {
    return null;
  }
  const key = e.key.toLowerCase();
  if (key === 'y' || (key === 'z' && e.shiftKey)) {
    return 'redo';
  }
  if (key === 'z') {
    return 'undo';
  }
  return null;
}

export function canvasKeyAction(e: KeyboardEvent): CanvasKeyAction | null {
  // Another layer (a chip popover, a dialog) already handled this key.
  if (e.defaultPrevented) {
    return null;
  }
  const target = e.target;
  if (target instanceof Element && target.closest(FOCUS_GUARD_SELECTOR)) {
    return null;
  }
  return plainCanvasKeyAction(e) ?? historyKeyAction(e);
}

// Undo/redo via YAML snapshots (⌘Z / ⌘⇧Z), stored to survive lane switches; `recordEdit` no-ops on
// unchanged round-trips and folds an external (Monaco) edit into one step when seen on return.
export function useEditHistory(
  yaml: string,
  onChange: (next: string) => void,
  onNavigate?: (from: string, to: string) => void,
  // Runs before a history step applies — discards the inspector's in-flight draft (positional node
  // ids shift when a step is undone, so the draft can't safely re-commit).
  beforeApply?: () => void
) {
  const undoStack = usePipelineEditorStore((s) => s.editUndoStack);
  const redoStack = usePipelineEditorStore((s) => s.editRedoStack);
  const baseline = usePipelineEditorStore((s) => s.editBaseline);
  const recordEdit = usePipelineEditorStore((s) => s.recordEdit);
  const commitEditHistory = usePipelineEditorStore((s) => s.commitEditHistory);

  // Observe every document state; recordEdit pushes an undo step only on a real change.
  useEffect(() => {
    recordEdit(yaml);
  }, [yaml, recordEdit]);

  const undo = useCallback(() => {
    if (undoStack.length === 0 || baseline === null) {
      return;
    }
    beforeApply?.();
    const target = undoStack.at(-1);
    if (target === undefined) {
      return;
    }
    commitEditHistory({ undo: undoStack.slice(0, -1), redo: [baseline, ...redoStack], baseline: target });
    onChange(target);
    onNavigate?.(baseline, target);
  }, [undoStack, redoStack, baseline, commitEditHistory, onChange, onNavigate, beforeApply]);

  const redo = useCallback(() => {
    if (redoStack.length === 0 || baseline === null) {
      return;
    }
    beforeApply?.();
    const target = redoStack[0];
    commitEditHistory({ undo: [...undoStack, baseline], redo: redoStack.slice(1), baseline: target });
    onChange(target);
    onNavigate?.(baseline, target);
  }, [undoStack, redoStack, baseline, commitEditHistory, onChange, onNavigate, beforeApply]);

  return { undo, redo, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 };
}
