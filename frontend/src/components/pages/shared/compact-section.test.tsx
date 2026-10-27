import { render, screen } from '@testing-library/react';

import { CompactSection } from './compact-section';

describe('compact section', () => {
  test('renders a full-width block card with the small card padding', () => {
    render(
      <CompactSection id="clusterDetails">
        <h3>Cluster Details</h3>
      </CompactSection>
    );

    const section = screen.getByRole('heading', { name: 'Cluster Details' }).parentElement;
    expect(section).toHaveAttribute('id', 'clusterDetails');
    expect(section).toHaveAttribute('data-slot', 'card');
    expect(section).toHaveClass('block', 'w-full', 'max-w-none', 'px-6', 'py-4');
    expect(section).not.toHaveClass('max-w-sm');
  });
});
