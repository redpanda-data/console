/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { MCPServer_Tool_ComponentType } from 'protogen/redpanda/api/dataplane/v1alpha3/mcp_pb';
import memoryCacheTemplate from './templates/cache/memory.yaml';
import redpandaCacheTemplate from './templates/cache/redpanda.yaml';
import generateInputTemplate from './templates/input/generate.yaml';
import redpandaOutputTemplate from './templates/output/redpanda.yaml';
import bigqueryProcessorTemplate from './templates/processor/gcp_bigquery_select.yaml';
import httpProcessorTemplate from './templates/processor/http.yaml';

export interface Template {
  name: string;
  componentType: MCPServer_Tool_ComponentType;
  yaml: Record<string, any>;
  description: string;
}

export const templates: Template[] = [
  {
    name: 'HTTP Request',
    componentType: MCPServer_Tool_ComponentType.PROCESSOR,
    yaml: httpProcessorTemplate,
    description: 'Fetch data from HTTP endpoints',
  },
  {
    name: 'BigQuery Select',
    componentType: MCPServer_Tool_ComponentType.PROCESSOR,
    yaml: bigqueryProcessorTemplate,
    description: 'Query data from Google BigQuery',
  },
  {
    name: 'Memory Cache',
    componentType: MCPServer_Tool_ComponentType.CACHE,
    yaml: memoryCacheTemplate,
    description: 'In-memory cache for storing user data, configuration, and temporary values',
  },
  {
    name: 'Redpanda Cache',
    componentType: MCPServer_Tool_ComponentType.CACHE,
    yaml: redpandaCacheTemplate,
    description: 'Redpanda-backed distributed cache using Kafka topics for persistence',
  },
  {
    name: 'Generate Input',
    componentType: MCPServer_Tool_ComponentType.INPUT,
    yaml: generateInputTemplate,
    description: 'Generate example user event messages with realistic data',
  },
  {
    name: 'Redpanda Output',
    componentType: MCPServer_Tool_ComponentType.OUTPUT,
    yaml: redpandaOutputTemplate,
    description: 'Publishes a message to a specified Redpanda topic',
  },
];

export {
  httpProcessorTemplate,
  bigqueryProcessorTemplate,
  memoryCacheTemplate,
  redpandaCacheTemplate,
  generateInputTemplate,
  redpandaOutputTemplate,
};
