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

import {
  ServerlessEgressGateway_State,
  ServerlessEgressGatewaySchema,
  ServerlessEgressGatewayStatus_Phase,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/serverless_egress_gateway_pb';
import { create } from '@bufbuild/protobuf';

import { egressGatewayOptions, egressWrite } from './egress-gateways';
import { describe, expect, it } from 'bun:test';

const gateway = (id: string, displayName: string, phase: ServerlessEgressGatewayStatus_Phase) =>
  create(ServerlessEgressGatewaySchema, {
    id,
    displayName,
    state: ServerlessEgressGateway_State.READY,
    status: { phase },
  });

describe('egressGatewayOptions', () => {
  it('offers usable gateways and keeps selected unusable ones, marked', () => {
    const gateways = [
      gateway('gw-b', 'beta', ServerlessEgressGatewayStatus_Phase.AVAILABLE),
      gateway('gw-a', 'alpha', ServerlessEgressGatewayStatus_Phase.AVAILABLE),
      gateway('gw-pending', 'pending', ServerlessEgressGatewayStatus_Phase.PENDING),
      gateway('gw-unselected', 'rejected', ServerlessEgressGatewayStatus_Phase.REJECTED),
    ];

    expect(egressGatewayOptions(gateways, ['gw-pending', 'gw-gone'])).toEqual([
      { id: 'gw-a', label: 'alpha', available: true },
      { id: 'gw-b', label: 'beta', available: true },
      { id: 'gw-pending', label: 'pending (not available)', available: false },
      { id: 'gw-gone', label: 'gw-gone (not found)', available: false },
    ]);
  });

  it('labels selected gateways by ID until the gateways load', () => {
    expect(egressGatewayOptions(undefined, ['gw-a'])).toEqual([{ id: 'gw-a', label: 'gw-a', available: false }]);
  });
});

describe('egressWrite', () => {
  it('leaves the stored gateways alone unless the selection changed', () => {
    expect(egressWrite([], [])).toBeUndefined();
    expect(egressWrite(['gw-b', 'gw-a'], ['gw-a', 'gw-b'])).toBeUndefined();
    expect(egressWrite(['gw-a'], [])?.gatewayRefs.map((ref) => ref.id)).toEqual(['gw-a']);
    expect(egressWrite([], ['gw-a'])?.gatewayRefs).toEqual([]);
  });
});
