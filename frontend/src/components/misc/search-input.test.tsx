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
      <SearchInput onChange={setQuery} slashToFocus={slashToFocus} value={query} />
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
  await user.keyboard('{Escape}');
  expect(search).toHaveValue('');
  expect(search).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(search).not.toHaveFocus();
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
