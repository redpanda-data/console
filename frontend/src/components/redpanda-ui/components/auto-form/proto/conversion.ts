import { type DescMessage, isMessage } from '@bufbuild/protobuf';
import type { JSONSchemaType } from '../../json-field/json-value';

import type { ParsedField } from '../../../lib/form-types';
import { protoToFormValues } from '../../../lib/protobuf-provider/form-values';
import { getProtoFieldCustomData } from '../../../lib/protobuf-provider/metadata';

export function getProtoJsonSchema(field: ParsedField): JSONSchemaType {
  const protoData = getProtoFieldCustomData(field);

  const jsonKind = protoData?.jsonKind;
  switch (jsonKind) {
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
    case undefined:
    case 'struct':
    case 'value':
      return { type: 'object' };
    default:
      throw new Error(jsonKind satisfies never);
  }
}

export function normalizeProtoInitialValues(
  desc: DescMessage,
  values?: Partial<Record<string, unknown>>
): Record<string, unknown> | undefined {
  if (values === undefined) {
    return;
  }

  if (isMessage(values, desc)) {
    return protoToFormValues(desc, values);
  }

  return values;
}
