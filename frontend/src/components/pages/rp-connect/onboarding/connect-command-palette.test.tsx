import userEvent from '@testing-library/user-event';
import { ComponentStatus } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { render, screen, waitFor } from 'test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectCommandPalette } from './connect-command-palette';
import type { ConnectComponentType, ExtendedConnectComponentSpec } from '../types/schema';

const KAFKA_OPTION = /kafka_franz/;
const GENERATE_OPTION = /generate/;
const HTTP_CLIENT_OPTION = /http_client/;
const NO_INPUTS_MATCH = /No inputs match/;
const EXISTS_AS_CACHE = /it exists as a cache/;

const component = (
  name: string,
  type: ConnectComponentType,
  extra: Partial<ExtendedConnectComponentSpec> = {}
): ExtendedConnectComponentSpec =>
  ({ name, type, status: ComponentStatus.STABLE, ...extra }) as ExtendedConnectComponentSpec;

const INPUT_COMPONENTS: ExtendedConnectComponentSpec[] = [
  component('kafka_franz', 'input', { summary: 'Consume from Kafka', categories: ['Services'] }),
  component('generate', 'input', { summary: 'Generate synthetic messages', categories: ['Utility'] }),
  component('http_client', 'input', { summary: 'Poll an HTTP endpoint', categories: ['Network'] }),
];

const renderPalette = (props: Partial<Parameters<typeof ConnectCommandPalette>[0]> = {}) =>
  render(
    <ConnectCommandPalette
      additionalComponents={INPUT_COMPONENTS}
      allowedTypes={['input']}
      onSelect={vi.fn()}
      {...props}
    />
  );

describe('ConnectCommandPalette', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('lists the in-scope components when browsing', async () => {
    renderPalette();
    // Scope to listbox options — the selected component also echoes its name in the detail pane.
    expect(await screen.findByRole('option', { name: KAFKA_OPTION })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: GENERATE_OPTION })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: HTTP_CLIENT_OPTION })).toBeInTheDocument();
  });

  it('filters the list down to matches as the user types', async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.type(screen.getByPlaceholderText('Search components…'), 'generate');

    await waitFor(() => expect(screen.getByRole('option', { name: GENERATE_OPTION })).toBeInTheDocument());
    expect(screen.queryByRole('option', { name: KAFKA_OPTION })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: HTTP_CLIENT_OPTION })).not.toBeInTheDocument();
  });

  it('explains a type-locked miss in the empty state', async () => {
    const user = userEvent.setup();
    // `redis` is only in scope as a cache, so a query for it while locked to inputs is a scoped miss.
    renderPalette({
      additionalComponents: [...INPUT_COMPONENTS, component('redis', 'cache', { summary: 'Redis cache' })],
    });

    await user.type(screen.getByPlaceholderText('Search components…'), 'redis');

    expect(await screen.findByText(NO_INPUTS_MATCH)).toBeInTheDocument();
    expect(screen.getByText(EXISTS_AS_CACHE)).toBeInTheDocument();
  });

  it('commits the highlighted component and records it under Recent', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderPalette({ onSelect });

    await user.dblClick(await screen.findByRole('option', { name: GENERATE_OPTION }));

    expect(onSelect).toHaveBeenCalledWith('generate', 'input');
    // The committed component now surfaces its own browse facet.
    expect(await screen.findByRole('tab', { name: 'Recent' })).toBeInTheDocument();
  });
});
