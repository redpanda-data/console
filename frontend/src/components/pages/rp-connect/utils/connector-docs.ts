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

const DOCS_BASE = docsLinks.cloud.connectComponents;
// Sections whose docs path is the naive plural (`${section}s`); metrics/tracer don't follow that rule.
const DOCS_SECTIONS = new Set(['input', 'output', 'processor', 'cache', 'rate_limit']);

/** Docs URL for a connector, or undefined for sections whose upstream path isn't the naive plural. */
export function getConnectorDocsUrl(section: string, connectorName: string): string | undefined {
  if (!DOCS_SECTIONS.has(section)) {
    return;
  }
  return `${DOCS_BASE}/${section}s/${connectorName}/`;
}
