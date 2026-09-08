import { expect, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import SearchBar from './search-bar';

const data = ['alpha', 'beta'];
const dataSource = () => data;
const matches = (query: string, item: string) => item.includes(query);
const onFilteredDataChanged = () => undefined;
function SearchExample() {
  const [query, setQuery] = useState('');
  return (
    <SearchBar
      dataSource={dataSource}
      filterText={query}
      isFilterMatch={matches}
      onFilteredDataChanged={onFilteredDataChanged}
      onQueryChanged={setQuery}
    />
  );
}

test('slash focuses search; Escape clears the filter then blurs', async () => {
  const user = userEvent.setup();
  render(<SearchExample />);
  const search = screen.getByRole('textbox');
  await user.keyboard('/');
  expect(search).toHaveFocus();
  expect(search).toHaveValue('');
  await user.type(search, 'alpha');
  await user.keyboard('{Escape}');
  expect(search).toHaveValue('');
  expect(search).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(search).not.toHaveFocus();
});

test('typing in other controls and modified shortcuts do not steal focus', async () => {
  const user = userEvent.setup();
  render(
    <>
      <SearchExample />
      <input aria-label="Other input" />
      <textarea aria-label="Other text" />
      {/* biome-ignore lint/a11y/useSemanticElements: exercises rich-text contenteditable shortcut isolation */}
      <div aria-label="Editor" contentEditable role="textbox" tabIndex={0} />
    </>
  );
  for (const name of ['Other input', 'Other text', 'Editor']) {
    const control = screen.getByRole('textbox', { name });
    await user.click(control);
    await user.keyboard('/{Escape}');
    expect(control).toHaveFocus();
  }
  await user.click(document.body);
  await user.keyboard('{Control>}/{/Control}');
  expect(screen.getByRole('textbox', { name: '' })).not.toHaveFocus();
});

test('unmount removes the global shortcut listener', async () => {
  const user = userEvent.setup();
  const { unmount } = render(<SearchExample />);
  unmount();
  const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
  document.body.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  render(<SearchExample />);
  await user.keyboard('/');
  expect(screen.getByRole('textbox')).toHaveFocus();
});
