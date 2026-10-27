import { expect, rs, test } from '@rstest/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from 'components/redpanda-ui/components/button';
import { useHotKey } from 'hooks/use-hot-key';

import { ElementTooltip } from './element-tooltip';

test('keyboard focus adds the hint to the description the element already has', async () => {
  const user = userEvent.setup();
  render(
    <>
      <p id="drag-instructions">Press space to lift</p>
      <ElementTooltip content="Drag to reorder">
        <button aria-describedby="drag-instructions" aria-label="Reorder column" type="button" />
      </ElementTooltip>
    </>
  );
  await user.tab();
  const handle = screen.getByRole('button', { name: 'Reorder column' });
  expect(handle).toHaveFocus();
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Drag to reorder');
  expect(handle).toHaveAccessibleDescription('Press space to lift Drag to reorder');
});

test('a hint that repeats the accessible name is shown but not announced twice', async () => {
  const user = userEvent.setup();
  render(
    <ElementTooltip content="Close">
      <button aria-label="Close" type="button" />
    </ElementTooltip>
  );
  await user.tab();
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Close');
  expect(screen.getByRole('button', { name: 'Close' })).not.toHaveAttribute('aria-describedby');
});

function SheetWithEscapeShortcut({ onEscape }: { onEscape: () => void }) {
  useHotKey({ key: 'Escape', onTrigger: onEscape });
  return (
    <ElementTooltip content="Back to the panel">
      <button type="button">Collapse</button>
    </ElementTooltip>
  );
}

test('pressing Escape hides the hint and still reaches the page shortcut', async () => {
  const user = userEvent.setup();
  const onEscape = rs.fn();
  render(<SheetWithEscapeShortcut onEscape={onEscape} />);
  await user.tab();
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Back to the panel');
  await user.keyboard('{Escape}');
  expect(onEscape).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
});

test('a Registry Button keeps its test id', () => {
  render(
    <ElementTooltip content="Delete draft">
      <Button aria-label="Delete draft" testId="delete-draft" />
    </ElementTooltip>
  );
  expect(screen.getByRole('button', { name: 'Delete draft' })).toHaveAttribute('data-testid', 'delete-draft');
});

test('without a hint the element renders untouched', () => {
  render(
    <ElementTooltip content={undefined}>
      <button type="button">Save</button>
    </ElementTooltip>
  );
  expect(screen.getByRole('button', { name: 'Save' })).not.toHaveAttribute('data-slot');
});
