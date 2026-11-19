import { afterEach } from '@rstest/core';
import { renderWithRouter, screen } from 'test-utils';

import { NotFoundPage } from './not-found-page';
import { config } from '../../config';

const originalClusterId = config.clusterId;
afterEach(() => {
  config.clusterId = originalClusterId;
});

describe('the NotFoundPage', () => {
  test('shows the Redpanda AI migration page for a removed AI route', () => {
    config.clusterId = 'cluster-123';
    renderWithRouter(<NotFoundPage />, { initialLocation: '/agents/agent-123' });

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
    renderWithRouter(<NotFoundPage />, { initialLocation: '/agentship' });

    expect(screen.getByRole('heading', { level: 1, name: 'Resource not found.' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: 'Open Redpanda AI' })).not.toBeInTheDocument();
  });
});
