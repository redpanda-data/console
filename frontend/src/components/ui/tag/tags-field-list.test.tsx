import { expect, test } from '@rstest/core';
import { userEvent } from '@testing-library/user-event';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import { TagsFieldList } from './tags-field-list';
import { render, screen } from '../../../test-utils';

type TagForm = { labels: Array<{ key: string; value: string }> };

function TagEditor() {
  const form = useForm<TagForm>({ defaultValues: { labels: [{ key: 'environment', value: 'development' }] } });
  const tags = useFieldArray({ control: form.control, name: 'labels' });
  const values = useWatch({ control: form.control });
  return (
    <form>
      <TagsFieldList
        appendTag={tags.append}
        fieldName="labels"
        fieldNames={(index) => ({ key: `labels.${index}.key`, value: `labels.${index}.value` })}
        form={form}
        removeTag={tags.remove}
        tagFields={tags.fields}
      />
      <output aria-label="Current tags">{JSON.stringify(values.labels)}</output>
    </form>
  );
}

test('edits the actual field-array key and value paths', async () => {
  const user = userEvent.setup();
  render(<TagEditor />);
  await user.clear(screen.getByPlaceholderText('Key'));
  await user.type(screen.getByPlaceholderText('Key'), 'region');
  await user.clear(screen.getByPlaceholderText('Value'));
  await user.type(screen.getByPlaceholderText('Value'), 'west');
  expect(screen.getByRole('status', { name: 'Current tags' })).toHaveTextContent('[{"key":"region","value":"west"}]');
});

test('appends and removes real field-array rows without losing surviving values', async () => {
  const user = userEvent.setup();
  render(<TagEditor />);
  await user.click(screen.getByRole('button', { name: 'Add Tag' }));
  await user.type(screen.getAllByPlaceholderText('Key')[1], 'region');
  await user.type(screen.getAllByPlaceholderText('Value')[1], 'west');
  await user.click(screen.getAllByRole('button', { name: '' })[0]);
  expect(screen.getAllByPlaceholderText('Key')).toHaveLength(1);
  expect(screen.getByPlaceholderText('Key')).toHaveValue('region');
  expect(screen.getByPlaceholderText('Value')).toHaveValue('west');
  expect(screen.getByRole('status', { name: 'Current tags' })).toHaveTextContent('[{"key":"region","value":"west"}]');
});
