import { render, screen } from '@testing-library/react';

import { OpenAIIcon, SalesforceIcon, SlackIcon } from './brand-icons';
import { createHash } from 'node:crypto';

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
  });

  test.each([
    ['Slack', SlackIcon, '69c3650cc9632f4edcf00bb5fd02792d5cb46d8af58f8db5001ba64cdd40da4b'],
    ['OpenAI', OpenAIIcon, '3fae9b38d571a5ab5aa662bc279dcda580855d6ca6b35330e4b4ba171367ffb1'],
    ['Salesforce', SalesforceIcon, '1d3af188552e86b2e368f97efcbe990d32ae8a2d870d169f9284cd680b18c5c5'],
  ])('%s path is byte-identical to simple-icons 13.8.0', (_title, Icon, upstreamSha256) => {
    render(<Icon data-testid="icon" />);

    const path = screen.getByTestId('icon').querySelector('path')?.getAttribute('d') ?? '';
    expect(createHash('sha256').update(path).digest('hex')).toBe(upstreamSha256);
  });

  test('defaults to 24px like simple-icons', () => {
    render(<SlackIcon data-testid="icon" />);

    expect(screen.getByTestId('icon')).toHaveAttribute('width', '24');
  });
});
