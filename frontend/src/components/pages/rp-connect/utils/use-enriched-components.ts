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

/**
 * Component specs enriched with the raw config schema's per-field signals (secret, exact
 * required-ness) that the ListComponents proto drops. `components` stays empty until the schema
 * query settles so YAML is never generated from un-enriched specs; if that query fails, specs
 * fall back to proto flags.
 */
export function useEnrichedComponents(): {
  components: ConnectComponentSpec[];
  componentList: ComponentList | undefined;
  isLoading: boolean;
} {
  const { data: componentListResponse, isLoading: isComponentListLoading } = useListComponentsQuery();
  const { data: schemaResponse, isLoading: isSchemaLoading } = useGetPipelineServiceConfigSchemaQuery();

  const components = useMemo(() => {
    if (!componentListResponse?.components || isSchemaLoading) {
      return [];
    }
    return enrichComponentsWithConfigSchema(
      parseSchema(componentListResponse.components),
      schemaResponse?.configSchema
    );
  }, [componentListResponse, schemaResponse, isSchemaLoading]);

  return {
    components,
    componentList: componentListResponse?.components,
    isLoading: isComponentListLoading || isSchemaLoading,
  };
}
