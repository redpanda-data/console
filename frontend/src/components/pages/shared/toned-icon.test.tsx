import { render, screen } from '@testing-library/react';
import { CheckIcon } from 'components/icons';
import { Spinner } from 'components/redpanda-ui/components/spinner';

import { TonedIcon } from './toned-icon';

describe('toned icon', () => {
  test('keeps layout classes and forwards icon props', () => {
    render(<TonedIcon className="size-4 shrink-0" data-testid="icon" icon={CheckIcon} size={18} tone="success" />);

    const svg = screen.getByTestId('icon');
    expect(svg).toHaveClass('size-4', 'shrink-0', 'text-success');
    expect(svg).toHaveAttribute('width', '18');
  });

  test('spins only when asked', () => {
    const { rerender } = render(<TonedIcon data-testid="icon" icon={CheckIcon} />);
    expect(screen.getByTestId('icon')).not.toHaveClass('animate-spin');

    rerender(<TonedIcon data-testid="icon" icon={CheckIcon} spin />);
    expect(screen.getByTestId('icon')).toHaveClass('animate-spin');
  });

  test('tones a registry spinner without dropping its status role', () => {
    render(<TonedIcon icon={Spinner} tone="muted" />);

    expect(screen.getByRole('status', { name: 'Loading' })).toHaveClass('text-muted-foreground', 'animate-spin');
  });
});
