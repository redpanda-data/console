import type { BadgeGroupItem } from 'components/redpanda-ui/components/badge-group';
import type { ReactNode } from 'react';

type BadgeGroupItemSource<T> = {
  /** Domain identity of the value. A repeat gets an occurrence suffix, since BadgeGroup throws on duplicates. */
  id: (value: T) => string;
  /** Plain-text label, read out for hidden items. Falls back to the id when empty. */
  text: (value: T) => string;
  content: (value: T) => ReactNode;
};

export function toBadgeGroupItems<T>(values: readonly T[], source: BadgeGroupItemSource<T>): BadgeGroupItem[] {
  const used = new Set<string>();
  return values.map((value) => {
    const base = source.id(value).trim() || source.text(value).trim() || '-';
    let id = base;
    for (let n = 2; used.has(id); n++) {
      id = `${base}#${n}`;
    }
    used.add(id);
    return { id, textValue: source.text(value).trim() || id, content: source.content(value) };
  });
}
