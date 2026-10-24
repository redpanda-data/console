import { useState } from 'react';

/** Checkbox selection over a list of row ids, with a select-all toggle that clears a partial selection. */
export function useRowSelection(rowIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return {
    selected,
    allSelected: rowIds.length > 0 && selected.size === rowIds.length,
    someSelected: selected.size > 0,
    toggleAll: () => setSelected(selected.size > 0 ? new Set() : new Set(rowIds)),
    toggleRow,
    clear: () => setSelected(new Set()),
  };
}
