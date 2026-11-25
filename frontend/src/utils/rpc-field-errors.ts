import type { ConnectError } from '@connectrpc/connect';
import { BadRequestSchema } from 'protogen/google/rpc/error_details_pb';

/** Decode validation details using the wire schema rather than assuming a debug JSON shape. */
export function getRpcFieldErrors(error: ConnectError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const detail of error.findDetails(BadRequestSchema)) {
    for (const violation of detail.fieldViolations) {
      fields[violation.field] = violation.description;
    }
  }
  return fields;
}
