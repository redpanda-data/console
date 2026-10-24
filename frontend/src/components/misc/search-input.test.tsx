import { expect, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { SearchInput } from './search-input';

function Example({ slashToFocus }: { slashToFocus?: boolean }) {
  const [query, setQuery] = useState('');
  return (
    <>
      <input aria-label="Other field" />
      <SearchInput aria-label="Search items" onChange={setQuery} slashToFocus={slashToFocus} value={query} />
      <output>{query}</output>
    </>
  );
}

test('slash focuses the field; Escape clears it, then blurs', async () => {
  const user = userEvent.setup();
  render(<Example />);
  const search = screen.getByTestId('search-field-input');
  await user.keyboard('/');
  expect(search).toHaveFocus();
  await user.type(search, 'alpha');
  expect(screen.getByRole('status')).toHaveTextContent('alpha');
  await expectEscapeClearsThenBlurs(user, search);
});

test('slash typed into another field is left alone', async () => {
  const user = userEvent.setup();
  render(<Example />);
  const other = screen.getByLabelText('Other field');
  await user.click(other);
  await user.keyboard('/');
  expect(other).toHaveValue('/');
  expect(screen.getByTestId('search-field-input')).not.toHaveFocus();
});

test('clearing with the button keeps focus in the field', async () => {
  const user = userEvent.setup();
  render(<Example />);
  const search = screen.getByTestId('search-field-input');
  await user.type(search, 'beta');
  await user.click(screen.getByTestId('search-field-reset-icon'));
  expect(search).toHaveValue('');
  expect(search).toHaveFocus();
});

test('the clear button is hidden and unfocusable while empty', () => {
  render(<Example slashToFocus={false} />);
  const clear = screen.getByTestId('search-field-reset-icon');
  expect(clear).toBeDisabled();
  expect(clear).toHaveClass('invisible');
});

test('keyboard focus exposes the clear hint without replacing its accessible name', async () => {
  const user = userEvent.setup();
  render(<Example />);
  await user.click(screen.getByRole('textbox', { name: 'Search items' }));
  await user.paste('alpha');
  await user.tab();
  const clear = screen.getByRole('button', { name: 'Clear search' });
  expect(clear).toHaveFocus();
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Clear (Esc)');
  expect(clear).toHaveAccessibleDescription('Clear (Esc)');
  expect(clear).not.toHaveAttribute('title');
});

async function expectEscapeClearsThenBlurs(user: ReturnType<typeof userEvent.setup>, search: HTMLElement) {
  await user.keyboard('{Escape}');
  expect(search).toHaveValue('');
  expect(search).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(search).not.toHaveFocus();
}
