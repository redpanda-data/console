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

import { docsLinks } from 'utils/docs-links';

import type { PipelineFlowNode } from './pipeline-flow-parser';

const DOCS_BASE = docsLinks.cloud.connectComponents;
// `cache_resources` → `cache`: the component section an array-resource entry belongs to.
const RESOURCES_KEY_SUFFIX = /_resources$/;
// Sections whose docs path is the naive plural (`${section}s`); metrics/tracer don't follow that rule.
const DOCS_SECTIONS = new Set(['input', 'output', 'processor', 'cache', 'rate_limit']);

/** Docs URL for a connector, or undefined for sections whose upstream path isn't the naive plural. */
export function getConnectorDocsUrl(section: string, connectorName: string): string | undefined {
  if (!DOCS_SECTIONS.has(section)) {
    return;
  }
  return `${DOCS_BASE}/${section}s/${connectorName}/`;
}

type DocsNode = Pick<PipelineFlowNode, 'kind' | 'label' | 'section' | 'isCase' | 'resourceKey'>;

/** Whether a node names a component at all — structural rows have no reference page to link to. */
function isDocumentableNode(node: DocsNode): boolean {
  // Section headers, `switch` case wrappers and empty-section placeholders are structural.
  return node.kind !== 'section' && !node.isCase && node.label !== 'none' && node.label !== '';
}

/**
 * Docs URL for a parsed pipeline node (structure tree / canvas card), or undefined when the node
 * isn't a documented component. Resource rows resolve through the `*_resources` key they were
 * defined under, since `resource` isn't itself a component section.
 */
export function getNodeDocsUrl(node: DocsNode): string | undefined {
  if (!isDocumentableNode(node)) {
    return;
  }
  if (node.section === 'resource') {
    // Only array resources name a component; singletons (`buffer:`, `metrics:`, …) are labelled by
    // their YAML key, and an unnamed array entry falls back to that key too — neither is a component.
    if (!node.resourceKey || node.label === node.resourceKey) {
      return;
    }
    return getConnectorDocsUrl(node.resourceKey.replace(RESOURCES_KEY_SUFFIX, ''), node.label);
  }
  return getConnectorDocsUrl(node.section ?? '', node.label);
}
