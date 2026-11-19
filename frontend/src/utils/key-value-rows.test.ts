import { applyKeyValueRowChange, keyValueRowsFromFieldArray } from './key-value-rows';
import { describe, expect, mock, test } from 'bun:test';

const fields = [{ id: 'r1' }, { id: 'r2' }];
const pairs = [
  { key: 'a', value: '1' },
  { key: 'b', value: '2' },
];

const actions = () => ({ append: mock(), remove: mock(), edit: mock() });

describe('keyValueRowsFromFieldArray', () => {
  test('pairs field-array ids with the current values', () => {
    expect(keyValueRowsFromFieldArray(fields, pairs)).toEqual([
      { id: 'r1', pair: { key: 'a', value: '1' } },
      { id: 'r2', pair: { key: 'b', value: '2' } },
    ]);
  });

  test('fills a row whose value has not arrived yet', () => {
    expect(keyValueRowsFromFieldArray(fields, [pairs[0]])[1]).toEqual({ id: 'r2', pair: { key: '', value: '' } });
  });
});

describe('applyKeyValueRowChange', () => {
  const rows = keyValueRowsFromFieldArray(fields, pairs);

  test('an edit goes to the controller, keeping the field array', () => {
    const a = actions();
    applyKeyValueRowChange(rows, [rows[0], { id: 'r2', pair: { key: 'b', value: '3' } }], a);
    expect(a.edit).toHaveBeenCalledWith([pairs[0], { key: 'b', value: '3' }]);
    expect(a.append).not.toHaveBeenCalled();
  });

  test('an added row appends its pair without moving focus', () => {
    const a = actions();
    applyKeyValueRowChange(rows, [...rows, { id: 'new', pair: { key: '', value: '' } }], a);
    expect(a.append).toHaveBeenCalledWith({ key: '', value: '' }, { shouldFocus: false });
  });

  test('a removed row removes its position', () => {
    const a = actions();
    applyKeyValueRowChange(rows, [rows[1]], a);
    expect(a.remove).toHaveBeenCalledWith(0);
  });
});
