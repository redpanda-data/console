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

import type { ShadowLinkReader } from 'federation/types';

import { getBoxPreflightChecks } from './box-preflight';
import type { BrokerProgress } from './shadow-box-model';
import { describe, expect, test } from 'bun:test';

const healthyBrokers: BrokerProgress[] = [1, 2, 3].map((nodeId) => ({ nodeId, status: 'confirmed', blocks: false }));

const reader: ShadowLinkReader = {
  linkName: 'orders-dr',
  shadowClusterId: 'dr',
  shadowClusterName: 'dr-us-west-2',
  authentication: 'sasl',
  principal: 'shadow-orders',
};

const base = {
  linksThatStopBox: [] as string[],
  brokers: healthyBrokers,
  exemptPrincipals: ['shadow-orders'],
  allowAllReads: false,
  readers: [reader],
  readersResolving: false,
  readersIncomplete: false,
};

const statuses = (checks: ReturnType<typeof getBoxPreflightChecks>) =>
  Object.fromEntries(checks.map((check) => [check.id, check.status]));

const messageOf = (checks: ReturnType<typeof getBoxPreflightChecks>, id: string) =>
  checks.find((check) => check.id === id)?.message;

describe('getBoxPreflightChecks', () => {
  test('passes a source cluster whose readers are exempt', () => {
    expect(statuses(getBoxPreflightChecks(base))).toEqual({ 'own-links': 'pass', brokers: 'pass', readers: 'pass' });
  });

  test('blocks a cluster with a shadow link that hasn’t failed over, naming it', () => {
    const checks = getBoxPreflightChecks({ ...base, linksThatStopBox: ['from-prod'] });
    expect(statuses(checks)['own-links']).toBe('fail');
    expect(messageOf(checks, 'own-links')).toContain('hasn’t failed over');
    expect(messageOf(checks, 'own-links')).toContain('from-prod');
  });

  test('a cluster with shadow linking off isn’t a shadow, as is usual for a source', () => {
    expect(statuses(getBoxPreflightChecks({ ...base, linksThatStopBox: 'disabled' }))['own-links']).toBe('pass');
  });

  test('doesn’t pass the own-links check before the links load, and warns when they can’t', () => {
    expect(statuses(getBoxPreflightChecks({ ...base, linksThatStopBox: 'loading' }))['own-links']).toBe('pending');
    expect(statuses(getBoxPreflightChecks({ ...base, linksThatStopBox: 'error' }))['own-links']).toBe('warn');
  });

  test('a broker that isn’t answering would hold the box in Boxing, with no timeout', () => {
    const checks = getBoxPreflightChecks({
      ...base,
      brokers: [...healthyBrokers.slice(0, 2), { nodeId: 3, status: 'not-answering', blocks: undefined }],
    });
    expect(statuses(checks).brokers).toBe('warn');
    expect(messageOf(checks, 'brokers')).toContain('Broker 3 isn’t answering');
    expect(messageOf(checks, 'brokers')).toContain('no timeout');
  });

  test('warns about each reader the settings would block, by how it authenticates', () => {
    const checks = getBoxPreflightChecks({
      ...base,
      exemptPrincipals: ['someone-else'],
      readers: [
        reader,
        { ...reader, linkName: 'plain-dr', authentication: 'none', principal: undefined },
        { ...reader, linkName: 'mtls-dr', authentication: 'mtls', principal: undefined },
      ],
    });
    expect(messageOf(checks, 'reader-orders-dr')).toContain('reads as shadow-orders');
    expect(messageOf(checks, 'reader-plain-dr')).toContain('without SASL or mTLS');
    expect(messageOf(checks, 'reader-mtls-dr')).toContain('mTLS');
  });

  test('an empty name lets a link without SASL or mTLS read', () => {
    const checks = getBoxPreflightChecks({
      ...base,
      exemptPrincipals: [''],
      readers: [{ ...reader, authentication: 'none', principal: undefined }],
    });
    expect(statuses(checks).readers).toBe('pass');
  });

  test('flags a User: name, which matches nobody', () => {
    const checks = getBoxPreflightChecks({ ...base, exemptPrincipals: ['User:shadow-orders'] });
    expect(statuses(checks)).toMatchObject({ 'reader-orders-dr': 'warn', 'policy-prefix-User:shadow-orders': 'warn' });
  });

  test('skips reader checks when every consumer may read, or when nobody knows the readers', () => {
    expect(
      Object.keys(statuses(getBoxPreflightChecks({ ...base, exemptPrincipals: [], allowAllReads: true })))
    ).toEqual(['own-links', 'brokers']);
    expect(statuses(getBoxPreflightChecks({ ...base, readers: undefined })).readers).toBeUndefined();
  });

  test('waits for the host before saying no link reads from the cluster', () => {
    expect(statuses(getBoxPreflightChecks({ ...base, readers: [], readersResolving: true })).readers).toBe('pending');
    expect(messageOf(getBoxPreflightChecks({ ...base, readers: [] }), 'readers')).toContain('No shadow link');
  });

  test('when Cloud couldn’t check every link, says the readers it found may not be all of them', () => {
    expect(statuses(getBoxPreflightChecks({ ...base, readers: [], readersIncomplete: true }))).toMatchObject({
      'readers-incomplete': 'warn',
    });
    expect(statuses(getBoxPreflightChecks({ ...base, readersIncomplete: true }))).toMatchObject({
      readers: 'pass',
      'readers-incomplete': 'warn',
    });
  });
});
