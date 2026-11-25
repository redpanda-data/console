import { ALL_CONTEXT_ID, DEFAULT_CONTEXT_ID } from './schema-context-utils';
import { subjectsInContext, subjectsMatchingSearch } from './schema-list-filters';
import { describe, expect, test } from 'bun:test';

const SUBJECTS = [
  { name: 'orders-value', isSoftDeleted: false },
  { name: ':.staging:orders-value', isSoftDeleted: false },
  { name: ':.staging:cars-value', isSoftDeleted: true },
  { name: ':.prod:cars-value', isSoftDeleted: false },
];

const names = (subjects: { name: string }[]) => subjects.map((s) => s.name);

describe('subjectsInContext', () => {
  test('keeps every subject for "All" or without context support', () => {
    expect(subjectsInContext(SUBJECTS, true, ALL_CONTEXT_ID)).toStrictEqual(SUBJECTS);
    expect(subjectsInContext(SUBJECTS, false, '.staging')).toStrictEqual(SUBJECTS);
  });

  test('keeps unprefixed subjects for the default context', () => {
    expect(names(subjectsInContext(SUBJECTS, true, DEFAULT_CONTEXT_ID))).toStrictEqual(['orders-value']);
  });

  test('keeps subjects prefixed with a named context', () => {
    expect(names(subjectsInContext(SUBJECTS, true, '.staging'))).toStrictEqual([
      ':.staging:orders-value',
      ':.staging:cars-value',
    ]);
  });
});

describe('subjectsMatchingSearch', () => {
  test('keeps every subject without a query', () => {
    expect(subjectsMatchingSearch(SUBJECTS, '', undefined)).toStrictEqual(SUBJECTS);
  });

  test('matches names by case-insensitive regex', () => {
    expect(names(subjectsMatchingSearch(SUBJECTS, '^:\\.PROD', undefined))).toStrictEqual([':.prod:cars-value']);
  });

  test('falls back to a substring match when the query is not a valid regex', () => {
    expect(names(subjectsMatchingSearch([{ name: 'a(b', isSoftDeleted: false }], 'a(', undefined))).toStrictEqual([
      'a(b',
    ]);
  });

  test('matches a numeric query against the subjects using that schema ID', () => {
    const usages = [{ subject: ':.prod:cars-value' }];

    expect(names(subjectsMatchingSearch(SUBJECTS, ' 42 ', usages))).toStrictEqual([':.prod:cars-value']);
    expect(subjectsMatchingSearch(SUBJECTS, '42', undefined)).toStrictEqual([]);
  });
});
