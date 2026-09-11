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
// Sections whose docs path is the naive plural (`${section}s`); metrics/tracer don't follow that rule.
const DOCS_SECTIONS = new Set(['input', 'output', 'processor', 'cache', 'rate_limit']);
// `cache_resources` → the `cache` section its entries belong to.
const RESOURCES_KEY_SUFFIX = /_resources$/;

/** Docs URL for a connector, or undefined for sections whose upstream path isn't the naive plural. */
export function getConnectorDocsUrl(section: string, connectorName: string): string | undefined {
  if (!DOCS_SECTIONS.has(section)) {
    return;
  }
  return `${DOCS_BASE}/${section}s/${connectorName}/`;
}

/**
 * Docs URL for one field, anchored by its dotted path with list markers dropped
 * (`batching.byte_size` → `#batching-byte_size`) — exactly the form's field path. A name that
 * collides with a prose section on the page is anchored `-2` there instead (~0.2% of fields), and a
 * missed anchor lands at the top of the right page.
 */
export function getFieldDocsUrl(
  section: string,
  connectorName: string,
  fieldPath: readonly string[]
): string | undefined {
  const base = getConnectorDocsUrl(section, connectorName);
  if (!base || fieldPath.length === 0) {
    return base;
  }
  return `${base}#${fieldPath.join('-')}`;
}

type DocsNode = Pick<PipelineFlowNode, 'kind' | 'label' | 'section' | 'isCase' | 'resourceKey'>;

/** Docs URL for a parsed pipeline node, or undefined when the node names no documented component. */
export function getNodeDocsUrl(node: DocsNode): string | undefined {
  // Section headers, `switch` case wrappers and empty-section placeholders name no component.
  if (node.kind === 'section' || node.isCase || node.label === 'none') {
    return;
  }
  if (node.section === 'resource') {
    // `resource` is not a component section, so resolve through the `*_resources` key. Singletons
    // (`buffer:`, `metrics:`) and unnamed entries are labelled by that key itself — not components.
    if (!node.resourceKey || node.label === node.resourceKey) {
      return;
    }
    return getConnectorDocsUrl(node.resourceKey.replace(RESOURCES_KEY_SUFFIX, ''), node.label);
  }
  return getConnectorDocsUrl(node.section ?? '', node.label);
}
