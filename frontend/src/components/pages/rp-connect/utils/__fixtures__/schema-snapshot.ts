import { create } from '@bufbuild/protobuf';
import {
  ComponentListSchema,
  ComponentSpecSchema,
  type FieldSpec,
  FieldSpecSchema,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import schemaJson from '../../../../../assets/rp-connect-schema-full.json' with { type: 'json' };
import { isPresent } from '../../../../../utils/type-guards';
import type { RawFieldSpec } from '../../types/schema';

// Bridge snapshot field names (is_optional/default/...) to proto FieldSpec names so we reuse the form's required-field logic.
type SnapshotField = {
  name?: string;
  type?: string;
  kind?: string;
  is_optional?: boolean;
  default?: unknown;
  is_advanced?: boolean;
  is_deprecated?: boolean;
  children?: SnapshotField[];
};

// benthos's required rule (jSchemaIsRequired): no default and not optional; objects follow children.
// The snapshot has full default info, so we stamp requiredBySchema exactly like runtime enrichment does.
const snapshotRequired = (f: SnapshotField): boolean => {
  if (f.is_optional === true || 'default' in f) {
    return false;
  }
  if (!(isPresent(f.children) && f.children.length > 0)) {
    return true;
  }
  return f.children.some(snapshotRequired);
};

const toRawFieldSpec = (f: SnapshotField): FieldSpec & Pick<RawFieldSpec, 'requiredBySchema'> => ({
  ...create(FieldSpecSchema, {
    name: f.name,
    type: f.type,
    kind: f.kind,
    optional: f.is_optional,
    defaultValue: typeof f.default === 'string' ? f.default : undefined,
    advanced: f.is_advanced,
    deprecated: f.is_deprecated,
    children: f.children?.map(toRawFieldSpec),
  }),
  requiredBySchema: snapshotRequired(f),
});
const toComponents = (components: { name: string; config: SnapshotField }[]) =>
  components.map((component) =>
    create(ComponentSpecSchema, {
      name: component.name,
      config: toRawFieldSpec(component.config),
    })
  );
export const componentList = create(ComponentListSchema, {
  inputs: toComponents(schemaJson.inputs),
  outputs: toComponents(schemaJson.outputs),
  buffers: toComponents(schemaJson.buffers),
  caches: toComponents(schemaJson.caches),
  processors: toComponents(schemaJson.processors),
  rateLimits: toComponents(schemaJson['rate-limits']),
  scanners: toComponents(schemaJson.scanners),
  metrics: toComponents(schemaJson.metrics),
  tracers: toComponents(schemaJson.tracers),
});
