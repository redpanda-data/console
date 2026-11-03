import { beforeEach, describe, expect, it, rs } from '@rstest/core';
import userEvent from '@testing-library/user-event';
import { ComponentStatus } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { render, screen, waitFor } from 'test-utils';

import { ConnectCommandPalette } from './connect-command-palette';
import type { ConnectComponentType, ExtendedConnectComponentSpec } from '../types/schema';

const KAFKA_OPTION = /kafka_franz/;
const KAFKA_OUTPUT_OPTION = /kafka/;
const PG_STREAM_OPTION = /pg_stream/;
const POSTGRES_CDC_OPTION = /postgres_cdc/;
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
      onSelect={rs.fn()}
      {...props}
    />
  );

describe('the ConnectCommandPalette', () => {
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

  it('leaves deprecated components out of browsing and search', async () => {
    const user = userEvent.setup();
    renderPalette({
      additionalComponents: [
        ...INPUT_COMPONENTS,
        component('pg_stream', 'input', { status: ComponentStatus.DEPRECATED, summary: 'Consume from Postgres' }),
      ],
    });

    expect(await screen.findByRole('option', { name: KAFKA_OPTION })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: PG_STREAM_OPTION })).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Search components…'), 'consume');

    await waitFor(() => expect(screen.getByRole('option', { name: KAFKA_OPTION })).toBeInTheDocument());
    expect(screen.queryByRole('option', { name: PG_STREAM_OPTION })).not.toBeInTheDocument();
  });

  it('explains an exact-name search for a deprecated component and leads with its replacement', async () => {
    const user = userEvent.setup();
    renderPalette({
      additionalComponents: [
        ...INPUT_COMPONENTS,
        component('postgres_cdc', 'input', { summary: 'Stream Postgres changes' }),
        component('pg_stream', 'input', { status: ComponentStatus.DEPRECATED }),
      ],
    });

    await user.type(screen.getByPlaceholderText('Search components…'), 'pg_stream');

    const hint = await screen.findByTestId('palette-deprecated-hint');
    expect(hint).toHaveTextContent('pg_stream is deprecated. Use the postgres_cdc input instead.');
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent(POSTGRES_CDC_OPTION);
    expect(screen.queryByRole('option', { name: PG_STREAM_OPTION })).not.toBeInTheDocument();
  });

  it('gives no deprecation hint when a live component of that name is in scope', async () => {
    const user = userEvent.setup();
    renderPalette({
      additionalComponents: [
        component('kafka', 'input', { status: ComponentStatus.DEPRECATED }),
        component('kafka', 'output'),
        component('redpanda', 'input'),
      ],
      allowedTypes: ['input', 'output'],
    });

    await user.type(screen.getByPlaceholderText('Search components…'), 'kafka');

    expect(await screen.findByRole('option', { name: KAFKA_OUTPUT_OPTION })).toBeInTheDocument();
    expect(screen.queryByTestId('palette-deprecated-hint')).not.toBeInTheDocument();
  });

  it('keeps the hint when the live component of that name is the replacement', async () => {
    const user = userEvent.setup();
    renderPalette({
      additionalComponents: [
        component('jira', 'processor', { status: ComponentStatus.DEPRECATED }),
        component('jira', 'input'),
      ],
      allowedTypes: ['input', 'processor'],
    });

    await user.type(screen.getByPlaceholderText('Search components…'), 'jira');

    expect(await screen.findByTestId('palette-deprecated-hint')).toHaveTextContent(
      'jira is deprecated. Use the jira input instead.'
    );
  });

  it('commits the highlighted component and records it under Recent', async () => {
    const user = userEvent.setup();
    const onSelect = rs.fn();
    renderPalette({ onSelect });

    await user.dblClick(await screen.findByRole('option', { name: GENERATE_OPTION }));

    expect(onSelect).toHaveBeenCalledWith('generate', 'input');
    // The committed component now surfaces its own browse facet.
    expect(await screen.findByRole('tab', { name: 'Recent' })).toBeInTheDocument();
  });
});
