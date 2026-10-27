import { describe, expect, test } from '@rstest/core';
import { render, screen } from 'test-utils';

import { StepSurface } from './step-surface';

describe('stepSurface', () => {
  test('titles the form in the wizard card', () => {
    render(
      <StepSurface description="Pick a topic." inline={false} title="Read or write data from a topic">
        <input aria-label="Topic name" />
      </StepSurface>
    );

    expect(screen.getByRole('heading', { name: 'Read or write data from a topic' })).toBeVisible();
    expect(screen.getByText('Pick a topic.')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Topic name' })).toBeVisible();
  });

  test('keeps the card but drops its title when hideTitle is set', () => {
    render(
      <StepSurface description="Pick a topic." hideTitle inline={false} title="Read or write data from a topic">
        <input aria-label="Topic name" />
      </StepSurface>
    );

    expect(screen.queryByRole('heading', { name: 'Read or write data from a topic' })).toBeNull();
    expect(screen.queryByText('Pick a topic.')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Topic name' })).toBeVisible();
  });

  test('renders the form bare inline, without the card title', () => {
    render(
      <StepSurface description="Pick a topic." inline title="Read or write data from a topic">
        <input aria-label="Topic name" />
      </StepSurface>
    );

    expect(screen.queryByRole('heading', { name: 'Read or write data from a topic' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Topic name' })).toBeVisible();
  });
});
