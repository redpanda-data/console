import { CAT_LIMIT, namespaceTables, tablesForNamespace } from './catalog-tree-tables';
import type { Namespace, TableRef } from './sql-types';
import { describe, expect, test } from 'bun:test';

const table = (name: string, overrides: Partial<TableRef> = {}): TableRef => ({
  id: `rp.public.${name}`,
  name,
  namespaceName: 'public',
  catalogName: 'rp',
  ...overrides,
});

const namespace = (tables: TableRef[]): Namespace => ({ id: 'rp.public', name: 'public', tables });

const names = (tables: TableRef[]) => tables.map((t) => t.name);

describe('tablesForNamespace', () => {
  test('merges seeded and fetched tables, letting fetched tables win', () => {
    const seeded = table('orders');
    const fetched = table('orders', { topicName: 'orders-topic' });

    const merged = tablesForNamespace(namespace([seeded, table('users')]), [fetched, table('cars')]);

    expect(names(merged)).toEqual(['orders', 'users', 'cars']);
    expect(merged[0]?.topicName).toBe('orders-topic');
  });

  test('ignores fetched tables from other namespaces', () => {
    const merged = tablesForNamespace(namespace([]), [table('audit', { namespaceName: 'internal' })]);

    expect(merged).toEqual([]);
  });
});

describe('namespaceTables', () => {
  const many = Array.from({ length: CAT_LIMIT + 5 }, (_, i) => table(`t${String(i).padStart(2, '0')}`));

  test('paginates past the limit when not searching', () => {
    const view = namespaceTables(namespace(many), [], '', CAT_LIMIT);

    expect(view.paginate).toBe(true);
    expect(view.visible).toHaveLength(CAT_LIMIT);
    expect(view.remaining).toBe(5);
    expect(view.searching).toBe(false);
    expect(view.hidden).toBe(false);
  });

  test('filters by a trimmed, case-insensitive query without paginating', () => {
    const view = namespaceTables(namespace(many), [], '  T0  ', CAT_LIMIT);

    expect(view.paginate).toBe(false);
    expect(view.remaining).toBe(0);
    expect(view.searching).toBe(true);
    expect(names(view.visible)).toEqual(names(many.slice(0, 10)));
    expect(view.all).toHaveLength(many.length);
  });

  test('hides the namespace when a search misses its name and tables', () => {
    expect(namespaceTables(namespace([table('orders')]), [], 'zzz', CAT_LIMIT).hidden).toBe(true);
    expect(namespaceTables(namespace([table('orders')]), [], 'pub', CAT_LIMIT).hidden).toBe(false);
  });
});
