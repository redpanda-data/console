import { render, screen } from '@testing-library/react';

const { mockConfig, mockLocation, mockRouter } = rs.hoisted(() => ({
  mockConfig: {
    clusterId: 'cluster-123' as string | undefined,
  },
  mockLocation: {
    pathname: '/agents/agent-123',
  },
  mockRouter: {
    history: {
      back: rs.fn(),
    },
  },
}));

rs.mock('@redpanda-data/ui', () => ({
  Center: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Heading: ({ as: Component = 'h2', children }: { as?: 'h1' | 'h2'; children: React.ReactNode }) => (
    <Component>{children}</Component>
  ),
  Image: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

rs.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useLocation: () => mockLocation,
  useRouter: () => mockRouter,
}));

rs.mock('../../config', () => ({
  config: mockConfig,
}));

import { NotFoundPage } from './not-found-page';

describe('NotFoundPage', () => {
  beforeEach(() => {
    mockConfig.clusterId = 'cluster-123';
    mockLocation.pathname = '/agents/agent-123';
  });

  test('shows the Redpanda AI migration page for a removed AI route', () => {
    render(<NotFoundPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'This feature has moved' })).toBeVisible();
    expect(
      screen.getByText('AI agents, MCP servers, knowledge bases, and transcripts are now available in Redpanda AI.')
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Redpanda AI' })).toHaveAttribute(
      'href',
      'https://ai.redpanda.com/agents?adpEnvironmentId=cluster-123'
    );
    expect(screen.queryByRole('link', { name: 'Return home' })).not.toBeInTheDocument();
  });

  test('keeps the standard not-found page for other routes', () => {
    mockLocation.pathname = '/agentship';

    render(<NotFoundPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Resource not found.' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: 'Open Redpanda AI' })).not.toBeInTheDocument();
  });
});
