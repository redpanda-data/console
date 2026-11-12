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
  type ServerlessEgressGateway,
  ServerlessEgressGateway_State,
  ServerlessEgressGatewayStatus_Phase,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/serverless_egress_gateway_pb';
import { create } from '@bufbuild/protobuf';
import { isEmbedded, isFeatureFlagEnabled, isServerless } from 'config';
import { type Egress, EgressSchema, type Pipeline } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

/** Gateways come from the controlplane API, which the Console reaches only embedded in Cloud UI. */
export const isEgressGatewayPickerEnabled = () =>
  isFeatureFlagEnabled('enableServerlessEgressGateway') && isServerless() && isEmbedded();

export type EgressGatewayOption = {
  id: string;
  label: string;
  /** False for a gateway the pipeline names but that cannot carry traffic, or no longer exists. */
  available: boolean;
};

const isUsable = ({ state, status }: ServerlessEgressGateway) =>
  state === ServerlessEgressGateway_State.READY && status?.phase === ServerlessEgressGatewayStatus_Phase.AVAILABLE;

/**
 * The usable gateways, followed by any selected gateway that is not: those stay selected, marked,
 * so saving other settings doesn't silently drop them. Until the gateways load (`undefined`), a
 * selected gateway is labelled by its ID alone.
 */
export function egressGatewayOptions(
  gateways: ServerlessEgressGateway[] | undefined,
  selectedIds: string[]
): EgressGatewayOption[] {
  if (!gateways) {
    return selectedIds.map((id) => ({ id, label: id, available: false }));
  }
  const byId = new Map(gateways.map((gateway) => [gateway.id, gateway]));
  const usable = gateways
    .filter(isUsable)
    .map((gateway) => ({ id: gateway.id, label: gateway.displayName, available: true }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const unusable = selectedIds
    .filter((id) => !usable.some((option) => option.id === id))
    .map((id) => {
      const gateway = byId.get(id);
      return {
        id,
        label: gateway ? `${gateway.displayName} (not available)` : `${id} (not found)`,
        available: false,
      };
    });
  return [...usable, ...unusable];
}

export const storedEgressGatewayIds = (pipeline: Pipeline | undefined) =>
  pipeline?.egress?.gatewayRefs.map((ref) => ref.id) ?? [];

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

/**
 * The egress a save sends: unset when the selection matches what is stored, which leaves the stored
 * gateways alone; otherwise the whole selection, empty to remove them.
 */
export const egressWrite = (selectedIds: string[], storedIds: string[]): Egress | undefined =>
  sameIds(selectedIds, storedIds)
    ? undefined
    : create(EgressSchema, { gatewayRefs: selectedIds.map((id) => ({ id })) });
