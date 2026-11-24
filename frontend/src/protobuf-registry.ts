import {
  CreateShadowLinkMetadataSchema,
  DeleteShadowLinkMetadataSchema,
  UpdateShadowLinkMetadataSchema,
} from '@buf/redpandadata_cloud.bufbuild_es/redpanda/api/controlplane/v1/shadow_link_pb';
import { createRegistry } from '@bufbuild/protobuf';

export const protobufRegistry = createRegistry(
  CreateShadowLinkMetadataSchema,
  DeleteShadowLinkMetadataSchema,
  UpdateShadowLinkMetadataSchema
);
