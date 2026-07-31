/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { ConfigurationSchemaRegistry } from './configuration-schema-registry';
import type { UnifiedSchemaRegistryApiOptions } from '../../model';

const renderWithApiOptions = (apiOptions: UnifiedSchemaRegistryApiOptions) =>
  render(
    <ConfigurationSchemaRegistry
      syncOptions={{ schemaRegistryShadowingMode: { case: 'shadowSchemaRegistryApi', value: apiOptions } }}
    />
  );

describe('ConfigurationSchemaRegistry', () => {
  test('should display disabled state when sync options are undefined', () => {
    render(<ConfigurationSchemaRegistry syncOptions={undefined} />);

    expect(screen.getByTestId('schema-registry-status-badge')).toHaveTextContent('Disabled');
    expect(screen.getByTestId('schema-registry-disabled-description')).toHaveTextContent(
      'Schema Registry shadowing is off. The shadow cluster keeps its own independent Schema Registry.'
    );
    expect(screen.queryByTestId('schema-registry-mode-badge')).not.toBeInTheDocument();
  });

  test('should display disabled state when no shadowing mode is set', () => {
    render(<ConfigurationSchemaRegistry syncOptions={{ schemaRegistryShadowingMode: { case: undefined } }} />);

    expect(screen.getByTestId('schema-registry-status-badge')).toHaveTextContent('Disabled');
    expect(screen.queryByTestId('schema-registry-mode-badge')).not.toBeInTheDocument();
  });

  test('should display topic mode with enabled badge', () => {
    render(
      <ConfigurationSchemaRegistry
        syncOptions={{ schemaRegistryShadowingMode: { case: 'shadowSchemaRegistryTopic', value: {} } }}
      />
    );

    expect(screen.getByTestId('schema-registry-mode-badge')).toHaveTextContent('Redpanda');
    expect(screen.getByTestId('schema-registry-status-badge')).toHaveTextContent('Enabled');
    expect(screen.getByTestId('schema-registry-topic-description')).toHaveTextContent(
      "Replicate the source cluster's _schemas topic, which replaces the shadow cluster's Schema Registry."
    );
    expect(screen.queryByTestId('sr-config-source-url-value')).not.toBeInTheDocument();
  });

  test('should display full API mode configuration', () => {
    renderWithApiOptions({
      sourceUrl: 'https://psrc-x1234.us-east-1.aws.confluent.cloud',
      basicAuth: {
        username: 'sr-replicator',
        passwordSet: true,
        passwordSetAt: new Date('2026-07-01T12:00:00Z'),
      },
      tlsSettings: {
        enabled: true,
        tlsSettings: { case: 'tlsPemSettings', value: { ca: 'CA_PEM', cert: 'CERT_PEM', key: 'KEY_PEM' } },
      },
      tailIntervalSeconds: 10,
      fullSyncIntervalSeconds: 300,
      maxSourceRequestsPerSecond: 30,
      sourceFilter: {
        contexts: ['.prod', '.staging'],
        subjects: ['orders-value', ':.prod:payments-value'],
      },
      destinationMapping: {
        case: 'exact',
        mappings: [
          { source: '.prod', destination: '.dr' },
          { source: '.staging', destination: '.staging-dr' },
        ],
      },
      unsupportedSchemaFeaturePolicy: 2,
      paused: false,
    });

    expect(screen.getByTestId('schema-registry-mode-badge')).toHaveTextContent('Other');
    expect(screen.getByTestId('schema-registry-status-badge')).toHaveTextContent('Enabled');
    expect(screen.getByTestId('sr-config-source-url-value')).toHaveTextContent(
      'https://psrc-x1234.us-east-1.aws.confluent.cloud'
    );

    expect(screen.getByTestId('sr-config-auth-type-value')).toHaveTextContent('HTTP Basic');
    expect(screen.getByTestId('sr-config-auth-username-value')).toHaveTextContent('sr-replicator');
    expect(screen.getByTestId('sr-config-auth-password-value')).toHaveTextContent('Last changed Jul 1, 2026 at 12:00');

    expect(screen.getByTestId('sr-config-tls-enabled-value')).toHaveTextContent('true');
    expect(screen.getByTestId('sr-config-tls-trust-store-value')).toHaveTextContent('Custom CA');
    expect(screen.getByTestId('sr-config-tls-client-auth-value')).toHaveTextContent('mTLS certificate configured');

    const contextsValue = screen.getByTestId('sr-config-contexts-value');
    expect(contextsValue).toHaveTextContent('.prod');
    expect(contextsValue).toHaveTextContent('.staging');
    const subjectsValue = screen.getByTestId('sr-config-subjects-value');
    expect(subjectsValue).toHaveTextContent('orders-value');
    expect(subjectsValue).toHaveTextContent(':.prod:payments-value');
    expect(screen.getByTestId('sr-config-mapping-0')).toHaveTextContent('.prod');
    expect(screen.getByTestId('sr-config-mapping-0')).toHaveTextContent('.dr');
    expect(screen.getByTestId('sr-config-mapping-1')).toHaveTextContent('.staging-dr');
    expect(screen.queryByTestId('sr-config-mapping-identity')).not.toBeInTheDocument();

    expect(screen.getByTestId('sr-config-tail-interval-value')).toHaveTextContent('10s');
    expect(screen.getByTestId('sr-config-full-sync-interval-value')).toHaveTextContent('5m');
    expect(screen.getByTestId('sr-config-max-request-rate-value')).toHaveTextContent('30 req/s');
    expect(screen.getByTestId('sr-config-unsupported-features-value')).toHaveTextContent('Remove unsupported features');
    expect(screen.queryByTestId('sr-config-sync-defaults-value')).not.toBeInTheDocument();
  });

  test('should display API mode fallbacks when only the source URL is set', () => {
    renderWithApiOptions({
      sourceUrl: 'https://schema-registry.example.com:8081',
      unsupportedSchemaFeaturePolicy: 0,
      paused: false,
    });

    expect(screen.getByTestId('sr-config-source-url-value')).toHaveTextContent(
      'https://schema-registry.example.com:8081'
    );
    expect(screen.getByTestId('sr-config-no-auth')).toHaveTextContent('No authentication configured.');
    expect(screen.getByTestId('sr-config-tls-enabled-value')).toHaveTextContent('false');
    expect(screen.getByTestId('sr-config-tls-trust-store-value')).toHaveTextContent('System trust store');
    expect(screen.getByTestId('sr-config-tls-client-auth-value')).toHaveTextContent('None');
    expect(screen.getByTestId('sr-config-scope-entire-value')).toHaveTextContent('Entire Schema Registry');
    expect(screen.getByTestId('sr-config-sync-defaults-value')).toHaveTextContent('Cluster defaults');
    expect(screen.queryByTestId('sr-config-tail-interval-value')).not.toBeInTheDocument();
  });

  test('should treat an empty source filter as the entire registry', () => {
    renderWithApiOptions({
      sourceUrl: 'https://sr.example.com',
      sourceFilter: { contexts: [], subjects: [] },
      unsupportedSchemaFeaturePolicy: 0,
      paused: false,
    });

    expect(screen.getByTestId('sr-config-scope-entire-value')).toHaveTextContent('Entire Schema Registry');
    expect(screen.queryByTestId('sr-config-contexts-value')).not.toBeInTheDocument();
    expect(screen.getByTestId('sr-config-mapping-identity')).toBeInTheDocument();
  });

  test('should display exact context mappings when the scope is the entire registry', () => {
    renderWithApiOptions({
      sourceUrl: 'https://sr.example.com',
      destinationMapping: { case: 'exact', mappings: [{ source: '.prod', destination: '.dr' }] },
      unsupportedSchemaFeaturePolicy: 0,
      paused: false,
    });

    expect(screen.getByTestId('sr-config-scope-entire-value')).toHaveTextContent('Entire Schema Registry');
    expect(screen.getByTestId('sr-config-mapping-0')).toHaveTextContent('.prod');
    expect(screen.getByTestId('sr-config-mapping-0')).toHaveTextContent('.dr');
    expect(screen.queryByTestId('sr-config-mapping-identity')).not.toBeInTheDocument();
  });

  test('should display a paused badge when the API sync is paused', () => {
    renderWithApiOptions({
      sourceUrl: 'https://sr.example.com',
      unsupportedSchemaFeaturePolicy: 0,
      paused: true,
    });

    expect(screen.getByTestId('schema-registry-mode-badge')).toHaveTextContent('Other');
    expect(screen.getByTestId('schema-registry-status-badge')).toHaveTextContent('Paused');
  });

  test('should display identity mapping message when contexts are filtered without a mapping', () => {
    renderWithApiOptions({
      sourceUrl: 'https://sr.example.com',
      sourceFilter: { contexts: ['.prod'], subjects: [] },
      unsupportedSchemaFeaturePolicy: 0,
      paused: false,
    });

    expect(screen.getByTestId('sr-config-contexts-value')).toHaveTextContent('.prod');
    expect(screen.queryByTestId('sr-config-subjects-value')).not.toBeInTheDocument();
    expect(screen.getByTestId('sr-config-mapping-identity')).toHaveTextContent(
      'No mapping configured. Schemas land in the same context they came from.'
    );
  });

  test('should fall back to effective values for unset sync settings', () => {
    renderWithApiOptions({
      sourceUrl: 'https://sr.example.com',
      tailIntervalSeconds: 30,
      effectiveFullSyncIntervalSeconds: 300,
      unsupportedSchemaFeaturePolicy: 0,
      paused: false,
    });

    expect(screen.getByTestId('sr-config-tail-interval-value')).toHaveTextContent('30s');
    expect(screen.getByTestId('sr-config-full-sync-interval-value')).toHaveTextContent('5m');
    expect(screen.getByTestId('sr-config-max-request-rate-value')).toHaveTextContent('Cluster default');
    expect(screen.getByTestId('sr-config-unsupported-features-value')).toHaveTextContent('Fail the sync');
  });

  test('should display an unknown policy value without mislabeling it', () => {
    renderWithApiOptions({
      sourceUrl: 'https://sr.example.com',
      unsupportedSchemaFeaturePolicy: 99,
      paused: false,
    });

    expect(screen.getByTestId('sr-config-unsupported-features-value')).toHaveTextContent('Unknown policy (99)');
  });

  test('should display password as set when the change timestamp is missing', () => {
    renderWithApiOptions({
      sourceUrl: 'https://sr.example.com',
      basicAuth: { username: 'sr-user', passwordSet: true },
      unsupportedSchemaFeaturePolicy: 0,
      paused: false,
    });

    expect(screen.getByTestId('sr-config-auth-password-value')).toHaveTextContent('Set');
  });
});
