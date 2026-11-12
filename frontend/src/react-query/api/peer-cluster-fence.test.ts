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

import { Code, ConnectError } from '@connectrpc/connect';
import type { ShadowLinkPeerFence } from 'components/cluster-fence/shadow-link-topology';

import {
  PeerFenceReadError,
  peerFenceRefetchInterval,
  peerFenceRetry,
  unreadablePeerFence,
} from './peer-cluster-fence';
import { describe, expect, test } from 'bun:test';

const known = (state: 'fenced' | 'fencing'): ShadowLinkPeerFence => ({
  status: 'known',
  state,
  revision: 1n,
  exemptPrincipals: [],
  allowAllReads: false,
  brokers: [],
});

const noLeader = new PeerFenceReadError('no leader', { reason: 'no-leader' });
const timeout = new PeerFenceReadError('slow', { reason: 'timeout' });

describe('peerFenceRefetchInterval', () => {
  test.each([
    ['quick while brokers apply a change', { status: 'success', data: known('fencing') }, 3000],
    ['steady once settled', { status: 'success', data: known('fenced') }, 30_000],
    ['quick while there is no controller leader', { status: 'error', error: noLeader }, 5000],
    [
      'steady while a failed refresh still shows the last fence',
      { status: 'error', error: timeout, data: known('fenced') },
      30_000,
    ],
    ['slow after a failure with nothing to show', { status: 'error', error: timeout }, 120_000],
    [
      'slow until every broker runs a Redpanda with the feature',
      { status: 'success', data: { status: 'unavailable', reason: 'inactive' } },
      120_000,
    ],
    [
      'never once the API is missing',
      { status: 'success', data: { status: 'unavailable', reason: 'unsupported' } },
      false,
    ],
    [
      'never once the viewer can’t read it',
      { status: 'success', data: { status: 'unavailable', reason: 'forbidden' } },
      false,
    ],
  ] as const)('%s', (_, state, expected) => {
    expect(peerFenceRefetchInterval({ state })).toBe(expected);
  });
});

test('peerFenceRetry tries once more, except after a timeout', () => {
  expect(peerFenceRetry(0, noLeader)).toBe(true);
  expect(peerFenceRetry(1, noLeader)).toBe(false);
  expect(peerFenceRetry(0, timeout)).toBe(false);
});

test('a read that keeps failing says why only when there is no controller leader', () => {
  expect(unreadablePeerFence(noLeader)).toEqual({ status: 'unavailable', reason: 'no-leader' });
  expect(unreadablePeerFence(timeout)).toEqual({ status: 'unavailable', reason: 'error' });
  expect(unreadablePeerFence(new ConnectError('boom', Code.Internal))).toEqual({
    status: 'unavailable',
    reason: 'error',
  });
});
