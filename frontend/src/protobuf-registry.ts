import {
  CreateShadowLinkMetadataSchema,
  DeleteShadowLinkMetadataSchema,
  UpdateShadowLinkMetadataSchema,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/shadow_link_pb';
import { createRegistry } from '@bufbuild/protobuf';

// you have to pass a explicit list of protobuf types so the registry
// contains the messages you want to decode from/to
export const protobufRegistry = createRegistry(
  CreateShadowLinkMetadataSchema,
  DeleteShadowLinkMetadataSchema,
  UpdateShadowLinkMetadataSchema
);
