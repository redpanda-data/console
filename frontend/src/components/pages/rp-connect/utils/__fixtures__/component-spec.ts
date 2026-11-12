import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { ComponentSpecSchema, type FieldSpec, FieldSpecSchema } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';

import type { ConnectComponentSpec } from '../../types/schema';

type FieldFixture = Omit<MessageInitShape<typeof FieldSpecSchema>, 'children'> & {
  children?: FieldFixture[];
  secret?: boolean;
  requiredBySchema?: boolean;
};
type ComponentFixture = Omit<MessageInitShape<typeof ComponentSpecSchema>, 'type' | 'config'> &
  Pick<ConnectComponentSpec, 'type' | 'logoUrl'> & { config?: FieldFixture };

// Decode real message defaults, retaining the two UI-only schema-enrichment flags.
function createFixtureField(field: FieldFixture): FieldSpec {
  const { children, secret, requiredBySchema, $typeName: _typeName, ...message } = field;
  return {
    ...create(FieldSpecSchema, { ...message, children: children?.map(createFixtureField) }),
    ...(secret === undefined ? {} : { secret }),
    ...(requiredBySchema === undefined ? {} : { requiredBySchema }),
  };
}

/** Construct a complete RPC component rather than asserting a partial object to its message type. */
export function createComponentFixture(input: ComponentFixture): ConnectComponentSpec {
  const { config, type, logoUrl, $typeName: _typeName, ...message } = input;
  return {
    ...create(ComponentSpecSchema, { ...message, type, config: config ? createFixtureField(config) : undefined }),
    type,
    ...(logoUrl === undefined ? {} : { logoUrl }),
  };
}
