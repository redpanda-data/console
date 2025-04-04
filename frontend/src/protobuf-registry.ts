import { createRegistry } from '@bufbuild/protobuf';

// you have to pass a explicit list of protobuf types so the registry
// contains the messages you want to decode from/to
export const protobufRegistry = createRegistry();
