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

import groundTruthComponentsJson from './ground-truth-components.json' with { type: 'json' };
import groundTruthConfigSchemaJson from './ground-truth-config-schema.json' with { type: 'json' };
import type { ConnectComponentSpec, ConnectComponentType } from '../../types/schema';

/**
 * Fixtures captured from the Connect Cloud schema (RPCN 4.100.0, benthos v4.73.0): kafka/generate/
 * http_client inputs, aws_s3 output, mapping processor, chunker scanner. Descriptions are stubbed to
 * 'x'; flag/default/kind/type data is verbatim.
 *
 * `ground-truth-components.json` mirrors the ListComponents proto path byte-for-byte, losses
 * included — only string defaults survive, and there is no secret field. The config-schema JSON is
 * the matching GetPipelineServiceConfigSchema output: per-field flags plus `required`, no defaults.
 */
export const groundTruthComponents = groundTruthComponentsJson as unknown as ConnectComponentSpec[];

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
