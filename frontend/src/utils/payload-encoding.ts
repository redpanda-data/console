import { parseAsNumberLiteral } from 'nuqs/server';

import { PayloadEncoding } from '../protogen/redpanda/api/console/v1alpha1/common_pb';

const encodings = Object.values(PayloadEncoding).filter((value) => typeof value === 'number');

/** URL values must be a known encoding, not an arbitrary integer submitted to the API. */
export const payloadEncodingParser = parseAsNumberLiteral(encodings).withDefault(PayloadEncoding.UNSPECIFIED);
