import type { DescMessage } from '@bufbuild/protobuf';

import type { ParsedField } from '../../../lib/form-types';
import {
  getProtoFieldCustomData,
  type ProtoMapFormEntry,
  protoFormValuesToPayload,
  protoPayloadToFormValues,
  protoToFormValues,
} from '../../../lib/protobuf-provider';

export { protoFormValuesToPayload, protoPayloadToFormValues, protoToFormValues };

export function getProtoJsonSchema(field: ParsedField): Record<string, unknown> {
  const protoData = getProtoFieldCustomData(field);

  switch (protoData?.jsonKind) {
    case 'listValue':
      return { type: 'array' };
    case 'any':
      return {
        type: 'object',
        properties: {
          typeUrl: { type: 'string', title: 'Type URL' },
          valueBase64: { type: 'string', title: 'Base64 Payload' },
        },
      };
    default:
      return { type: 'object' };
  }
}

export function isProtoMapEntries(value: unknown): value is ProtoMapFormEntry[] {
  return Array.isArray(value);
}

function isProtoMessageShape(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && '$typeName' in (value as Record<string, unknown>));
}

export function normalizeProtoInitialValues(
  desc: DescMessage,
  values?: Partial<Record<string, unknown>>
): Record<string, unknown> | undefined {
  if (!values) {
    return;
  }

  if (isProtoMessageShape(values)) {
    return protoToFormValues(desc, values as never);
  }

  return values as Record<string, unknown>;
}
