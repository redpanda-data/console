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

import { describe, expect, test } from '@rstest/core';

import { getBoxPreflightChecks } from './box-preflight';
import type { BrokerProgress } from './shadow-box-model';

const healthyBrokers: BrokerProgress[] = [
  { nodeId: 0, status: 'applied' },
  { nodeId: 1, status: 'applied' },
  { nodeId: 2, status: 'applied' },
];

const reader = { linkName: 'orders-dr', shadowClusterId: 'dr', shadowClusterName: 'dr-us-west-2' };

const base = {
  ownShadowLinks: [],
  brokers: healthyBrokers,
  exemptPrincipals: ['shadow-orders'],
  allowAllReads: false,
  readers: [{ ...reader, principal: 'shadow-orders' }],
  readersResolving: false,
  readersIncomplete: false,
};

const statuses = (checks: ReturnType<typeof getBoxPreflightChecks>) =>
  Object.fromEntries(checks.map((check) => [check.id, check.status]));

describe('getBoxPreflightChecks', () => {
  test('passes a source cluster whose readers are exempt', () => {
    expect(statuses(getBoxPreflightChecks(base))).toEqual({ 'own-links': 'pass', brokers: 'pass', readers: 'pass' });
  });

  test('blocks a cluster that has shadow links of its own', () => {
    const checks = getBoxPreflightChecks({ ...base, ownShadowLinks: ['orders-dr'] });
    expect(checks[0]).toMatchObject({ id: 'own-links', status: 'fail' });
    expect(checks[0].message).toContain('orders-dr');
  });

  test('names the blocked link instead of repeating that nobody is exempt', () => {
    const ids = getBoxPreflightChecks({
      ...base,
      exemptPrincipals: [],
      readers: [{ linkName: 'orders-dr', shadowClusterId: 'dr', shadowClusterName: 'dr', principal: 'shadow-orders' }],
    }).map((check) => check.id);
    expect(ids).toContain('reader-orders-dr');
    expect(ids).not.toContain('policy-empty');
    expect(getBoxPreflightChecks({ ...base, exemptPrincipals: [], readers: [] }).map((check) => check.id)).toContain(
      'policy-empty'
    );
  });

  test('a cluster with shadow linking off has no links of its own, as is usual for a source', () => {
    expect(getBoxPreflightChecks({ ...base, ownShadowLinks: 'disabled' })[0]).toMatchObject({
      id: 'own-links',
      status: 'pass',
      message: expect.stringContaining('Shadow linking is off'),
    });
  });

  test('doesn’t pass the own-links check before the links load, and warns when they can’t', () => {
    expect(getBoxPreflightChecks({ ...base, ownShadowLinks: 'loading' })[0]).toMatchObject({ status: 'pending' });
    expect(getBoxPreflightChecks({ ...base, ownShadowLinks: 'error' })[0]).toMatchObject({
      status: 'warn',
      message: expect.stringContaining('Couldn’t check'),
    });
  });

  test('waits for the host before saying no link reads from the cluster', () => {
    expect(
      getBoxPreflightChecks({ ...base, readers: [], readersResolving: true }).find((check) => check.id === 'readers')
        ?.status
    ).toBe('pending');
  });

  test('warns about a broker that isn’t responding', () => {
    const checks = getBoxPreflightChecks({
      ...base,
      brokers: [...healthyBrokers.slice(0, 2), { nodeId: 2, status: 'unreachable' }],
    });
    expect(checks.find((check) => check.id === 'brokers')).toMatchObject({
      status: 'warn',
      message: expect.stringContaining('Broker 2 isn’t responding'),
    });
  });

  test('warns about each reader that can’t keep reading', () => {
    const checks = getBoxPreflightChecks({
      ...base,
      exemptPrincipals: [],
      readers: [
        { ...reader, principal: 'shadow-orders' },
        { ...reader, linkName: 'telemetry-dr' },
      ],
    });
    expect(checks.find((check) => check.id === 'reader-orders-dr')?.message).toContain('isn’t exempt');
    expect(checks.find((check) => check.id === 'reader-telemetry-dr')?.message).toContain('doesn’t use SASL');
    expect(checks.find((check) => check.id === 'policy-empty')).toBeUndefined();
  });

  test('skips reader checks when every consumer may read, or when nobody knows the readers', () => {
    expect(
      getBoxPreflightChecks({ ...base, allowAllReads: true, exemptPrincipals: [] }).map((check) => check.id)
    ).toEqual(['own-links', 'brokers']);
    expect(getBoxPreflightChecks({ ...base, readers: undefined }).map((check) => check.id)).toEqual([
      'own-links',
      'brokers',
    ]);
  });

  test('warns when Cloud knows of no link that reads from the cluster', () => {
    expect(getBoxPreflightChecks({ ...base, readers: [] }).find((check) => check.id === 'readers')?.status).toBe(
      'warn'
    );
  });

  test('when Cloud couldn’t check every link, doesn’t claim that none read from the cluster', () => {
    const checks = getBoxPreflightChecks({ ...base, readers: [], readersIncomplete: true });

    expect(checks.find((check) => check.id === 'readers')).toBeUndefined();
    expect(checks.find((check) => check.id === 'readers-incomplete')?.message).toContain('couldn’t check every');
  });

  test('when Cloud couldn’t check every link, says the readers it found may not be all of them', () => {
    expect(statuses(getBoxPreflightChecks({ ...base, readersIncomplete: true }))).toMatchObject({
      readers: 'pass',
      'readers-incomplete': 'warn',
    });
  });
});
