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
 * Ground-truth fixtures captured from the Connect Cloud schema (RPCN 4.100.0, benthos v4.73.0),
 * covering: kafka / generate / http_client inputs, aws_s3 output, mapping processor, chunker
 * scanner. Long prose (descriptions, option docs) is stubbed to 'x'; flag/default/kind/type
 * data is verbatim.
 *
 * `ground-truth-components.json` mirrors the ListComponents proto path byte-for-byte, including
 * its known losses: only string defaults survive (int/bool/collection defaults arrive as ''),
 * and there is no secret field. `ground-truth-config-schema.json` is the corresponding
 * GetPipelineServiceConfigSchema output (benthos MarshalJSONSchema): per-field
 * is_optional/is_advanced/is_secret/is_deprecated plus `required` arrays, but no defaults.
 */
export const groundTruthComponents = groundTruthComponentsJson as unknown as ConnectComponentSpec[];

/** Raw config schema JSON string, as served by GetPipelineServiceConfigSchema. */
export const groundTruthConfigSchema = JSON.stringify(groundTruthConfigSchemaJson);

export function getGroundTruthComponent(type: ConnectComponentType, name: string): ConnectComponentSpec {
  const component = groundTruthComponents.find((c) => c.type === type && c.name === name);
  if (!component) {
    throw new Error(`ground-truth fixture missing component ${type}:${name}`);
  }
  return component;
}
