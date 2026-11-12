import { create } from '@bufbuild/protobuf';

import {
  type KafkaRecordHeader,
  KafkaRecordHeaderSchema,
} from '../../../protogen/redpanda/api/console/v1alpha1/common_pb';

export function buildKafkaHeaders(headers: { key: string; value: string }[]) {
  const kafkaHeaders: KafkaRecordHeader[] = [];
  for (const h of headers) {
    if (!(h.key || h.value)) {
      continue;
    }
    const kafkaHeader = create(KafkaRecordHeaderSchema);
    kafkaHeader.key = h.key;
    kafkaHeader.value = new TextEncoder().encode(h.value);
    kafkaHeaders.push(kafkaHeader);
  }
  return kafkaHeaders;
}
