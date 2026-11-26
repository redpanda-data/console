import { describe, expect, test } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { render, screen } from 'test-utils';

import { Label, OptionGroup } from './tsx-utils';

describe('label', () => {
  test('associates the caption with its child control when no htmlFor is given', () => {
    render(
      <Label text="Topic name">
        <input />
      </Label>
    );

    expect(screen.getByRole('textbox', { name: 'Topic name' })).toBeVisible();
  });

  test('targets an explicit htmlFor without overwriting the child id', () => {
    render(
      <Label htmlFor="owned-input" text="Partition">
        <div>
          <input id="owned-input" />
        </div>
      </Label>
    );

    const input = screen.getByRole('textbox', { name: 'Partition' });
    expect(input).toBeVisible();
    expect(input).toHaveAttribute('id', 'owned-input');
  });

  test('keeps help separate from the control activation label', async () => {
    const user = userEvent.setup();
    render(
      <Label htmlFor="pagination" text="Continuous pagination" textSuffix={<span>Pagination help</span>}>
        <input id="pagination" type="checkbox" />
      </Label>
    );

    const control = screen.getByRole('checkbox');
    await user.click(screen.getByText('Pagination help'));
    expect(control).not.toBeChecked();
    await user.click(screen.getByText('Continuous pagination'));
    expect(control).toBeChecked();
  });
});

describe('optionGroup', () => {
  test('names the toggle group by its visible caption', () => {
    render(
      <OptionGroup<'single' | 'wrap'>
        label="Line mode"
        onChange={() => {
          // no op - test callback
        }}
        options={{ Single: 'single', Wrap: 'wrap' }}
        value="single"
      />
    );

    const group = screen.getByRole('group', { name: 'Line mode' });
    expect(group).toBeVisible();
    expect(group).toHaveAttribute('aria-labelledby', screen.getByText('Line mode').id);
  });
});
