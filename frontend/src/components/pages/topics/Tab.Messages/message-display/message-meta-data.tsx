/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type React from 'react';

import { MessageSchema } from './message-schema';
import type { Payload, TopicMessage } from '../../../../../state/rest-interfaces';
import { numberToThousandsString } from '../../../../../utils/tsx-utils';
import { prettyBytes, titleCase } from '../../../../../utils/utils';

// For example `Avro (12 / 1.2 kB)`, where 12 is the schema ID when there is one.
function describeValue(value: Payload): string {
  const schemaPrefix = value.schemaId > 0 ? `${value.schemaId} / ` : '';
  return `${titleCase(value.encoding)} (${schemaPrefix}${prettyBytes(value.size)})`;
}

export const MessageMetaData = (props: { msg: TopicMessage; topicName?: string }) => {
  const msg = props.msg;
  const data: { [k: string]: React.ReactNode } = {
    Partition: msg.partitionID,
    Offset: numberToThousandsString(msg.offset),
    Key: msg.key.isPayloadNull ? 'Null' : `${titleCase(msg.key.encoding)} (${prettyBytes(msg.key.size)})`,
    Value: msg.value.isPayloadNull ? 'Null' : describeValue(msg.value),
    Headers: msg.headers.length > 0 ? `${msg.headers.length}` : 'No headers set',
    Compression: msg.compression,
    Transactional: msg.isTransactional ? 'true' : 'false',
  };

  if (msg.value.schemaId) {
    data.Schema = <MessageSchema schemaId={msg.value.schemaId} topicName={props.topicName} />;
  }

  return (
    <div className="my-6 flex gap-10">
      {Object.entries(data).map(([k, v]) => (
        <div className="flex flex-col gap-[0.4em]" key={k}>
          <div className="text-body-lg font-semibold">{k}</div>
          <div className="text-body">{v}</div>
        </div>
      ))}
    </div>
  );
};
