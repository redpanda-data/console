import { render, screen } from '@testing-library/react';

import { OpenAIIcon, SalesforceIcon, SlackIcon } from './brand-icons';

describe('brand icons', () => {
  test.each([
    ['Slack', SlackIcon],
    ['OpenAI', OpenAIIcon],
    ['Salesforce', SalesforceIcon],
  ])('%s renders a titled, sized svg that forwards props', (title, Icon) => {
    render(<Icon className="h-5 w-5" data-testid="icon" size={16} />);

    const svg = screen.getByTestId('icon');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg).toHaveAttribute('width', '16');
    expect(svg).toHaveAttribute('height', '16');
    expect(svg).toHaveAttribute('fill', 'currentColor');
    expect(svg).toHaveClass('h-5', 'w-5');
    // allow: to-be-in-document — SVG <title> is never rendered, so visibility does not apply
    expect(screen.getByTitle(title)).toBeInTheDocument();
    expect(svg.querySelector('path')?.getAttribute('d')).toBeTruthy();
  });

  test('defaults to 24px like simple-icons', () => {
    render(<SlackIcon data-testid="icon" />);

    expect(screen.getByTestId('icon')).toHaveAttribute('width', '24');
  });
});
