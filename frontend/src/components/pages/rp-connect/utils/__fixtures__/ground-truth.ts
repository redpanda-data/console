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

import { ComponentStatus } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import { createComponentFixture } from './component-spec';
import groundTruthComponentsJson from './ground-truth-components.json' with { type: 'json' };
import groundTruthConfigSchemaJson from './ground-truth-config-schema.json' with { type: 'json' };
import type { ConnectComponentSpec, ConnectComponentType } from '../../types/schema';
import { CONNECT_COMPONENT_TYPE } from '../../types/schema';

/**
 * Fixtures captured from the Connect Cloud schema (RPCN 4.100.0, benthos v4.73.0): kafka/generate/
 * http_client inputs, aws_s3 output, mapping processor, chunker scanner. Descriptions are stubbed to
 * 'x'; flag/default/kind/type data is verbatim.
 *
 * `ground-truth-components.json` mirrors the ListComponents proto path byte-for-byte, losses
 * included — only string defaults survive, and there is no secret field. The config-schema JSON is
 * the matching GetPipelineServiceConfigSchema output: per-field flags plus `required`, no defaults.
 */
const statuses: Record<string, ComponentStatus | undefined> = {
  stable: ComponentStatus.STABLE,
  beta: ComponentStatus.BETA,
  experimental: ComponentStatus.EXPERIMENTAL,
  deprecated: ComponentStatus.DEPRECATED,
};
export const groundTruthComponents = groundTruthComponentsJson.map((component): ConnectComponentSpec => {
  const type = CONNECT_COMPONENT_TYPE.find((candidate) => candidate === component.type);
  const status = statuses[component.status];
  if (type === undefined || status === undefined) {
    throw new Error(`Invalid ground-truth component ${component.type}:${component.name}`);
  }
  return createComponentFixture({ ...component, type, status });
});

/** Raw config schema JSON string, as served by GetPipelineServiceConfigSchema. */
export const groundTruthConfigSchema = JSON.stringify(groundTruthConfigSchemaJson);

// Local lookup (not utils/schema's findConnectComponent): this fixture is imported by
// node-environment unit tests, and utils/schema transitively pulls in DOM-only modules (sonner).
export function getGroundTruthComponent(type: ConnectComponentType, name: string): ConnectComponentSpec {
  const component = groundTruthComponents.find((c) => c.type === type && c.name === name);
  if (!component) {
    throw new Error(`ground-truth fixture missing component ${type}:${name}`);
  }
  return component;
}
