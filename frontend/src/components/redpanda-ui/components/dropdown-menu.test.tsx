import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Button } from './button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';

function TestDropdownMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>Open user menu</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top">
        <DropdownMenuItem>Preferences</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe('DropdownMenu', () => {
  it('keeps Base UI popup behavior on the visible menu content element', async () => {
    const user = userEvent.setup();

    render(<TestDropdownMenu />);

    await user.click(screen.getByRole('button', { name: 'Open user menu' }));

    const menu = await screen.findByRole('menu');
    expect(menu).toHaveAttribute('data-slot', 'dropdown-menu-content');
    expect(menu).toHaveAttribute('data-state', 'open');
    const item = screen.getByRole('menuitem', { name: 'Preferences' });
    expect(item).toBeInTheDocument();

    await user.hover(item);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
