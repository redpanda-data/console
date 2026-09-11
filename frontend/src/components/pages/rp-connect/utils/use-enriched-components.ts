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

import type { ComponentList } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useMemo } from 'react';
import { useGetPipelineServiceConfigSchemaQuery, useListComponentsQuery } from 'react-query/api/connect';

import { parseSchema } from './schema';
import { enrichComponentsWithConfigSchema } from './schema-enrichment';
import type { ConnectComponentSpec } from '../types/schema';

// Parsing + enrichment JSON.parses the multi-megabyte config schema and clones every component's
// field tree. The query responses are shared cache objects, so memoize on their identities
// module-wide: the pipeline editor, onboarding wizard, and template panel mount at different
// times but must not each redo the work.
let lastEnrichment: {
  componentList: ComponentList;
  configSchema: string | undefined;
  result: ConnectComponentSpec[];
} | null = null;

function getEnrichedComponents(componentList: ComponentList, configSchema: string | undefined): ConnectComponentSpec[] {
  if (lastEnrichment?.componentList === componentList && lastEnrichment?.configSchema === configSchema) {
    return lastEnrichment.result;
  }
  const result = enrichComponentsWithConfigSchema(parseSchema(componentList), configSchema);
  lastEnrichment = { componentList, configSchema, result };
  return result;
}

/**
 * Component specs enriched with the per-field signals (secret, exact required-ness) the
 * ListComponents proto drops. Specs land as soon as ListComponents resolves — insert/generate must
 * keep working while the much larger config schema is still loading or hung — then re-emit with the
 * enrichment stamps once it settles; until then `checkRequired` runs in its degraded proto-flag mode.
 * Consumers needing full fidelity (template forms computing defaults once) can gate on `isLoading`.
 */
export function useEnrichedComponents(): {
  components: ConnectComponentSpec[];
  componentList: ComponentList | undefined;
  isLoading: boolean;
} {
  const { data: componentListResponse, isLoading: isComponentListLoading } = useListComponentsQuery();
  const { data: schemaResponse, isLoading: isSchemaLoading } = useGetPipelineServiceConfigSchemaQuery();

  const components = useMemo(() => {
    if (!componentListResponse?.components) {
      return [];
    }
    return getEnrichedComponents(componentListResponse.components, schemaResponse?.configSchema);
  }, [componentListResponse, schemaResponse]);

  return {
    components,
    componentList: componentListResponse?.components,
    isLoading: isComponentListLoading || isSchemaLoading,
  };
}
