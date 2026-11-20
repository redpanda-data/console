import type { KeyValuePair, KeyValueRow } from 'components/redpanda-ui/components/key-value-field';
import { describeKeyValueRowChange } from 'components/redpanda-ui/components/key-value-field/rows';

/**
 * KeyValueField rows for a React Hook Form array of pairs. RHF's `useFieldArray` ids are the row
 * identity, so they never enter form values or submitted data.
 */
export function keyValueRowsFromFieldArray(
  fields: readonly { id: string }[],
  pairs: readonly KeyValuePair[] | undefined
): KeyValueRow[] {
  return fields.map((row, index) => {
    const pair = pairs?.[index];
    return { id: row.id, pair: { key: pair?.key ?? '', value: pair?.value ?? '' } };
  });
}

type KeyValueFieldArrayActions = {
  append: (pair: KeyValuePair, options: { shouldFocus: false }) => void;
  remove: (index: number) => void;
  /** The controller's `field.onChange`: edits keep row ids, so they must not replace the field array. */
  edit: (pairs: KeyValuePair[]) => void;
};

/** Translates a KeyValueField change into the field-array action that keeps RHF's row ids. */
export function applyKeyValueRowChange(
  previous: readonly KeyValueRow[],
  next: readonly KeyValueRow[],
  actions: KeyValueFieldArrayActions
): void {
  const change = describeKeyValueRowChange(previous, next);
  switch (change.type) {
    case 'append':
      actions.append(change.pair, { shouldFocus: false });
      break;
    case 'remove':
      actions.remove(change.index);
      break;
    case 'edit':
      actions.edit(change.pairs);
      break;
    default:
      throw new TypeError('Unexpected key-value row action.', { cause: change satisfies never });
  }
}
