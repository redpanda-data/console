/** IDs are caller-owned domain identity, never inferred from an item's content or position. */
export function requireUniqueItemIds(items: readonly { id: string }[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item.id !== 'string' || item.id.trim() === '') {
      throw new TypeError('Items require a nonempty string ID.');
    }
    if (seen.has(item.id)) {
      throw new TypeError(`Duplicate item ID: ${item.id}`);
    }
    seen.add(item.id);
  }
}
