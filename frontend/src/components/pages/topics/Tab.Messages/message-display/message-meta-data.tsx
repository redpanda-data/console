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

import { Flex, Text } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import React from 'react';

import { MessageSchema } from './message-schema';
import type { TopicMessage } from '../../../../../state/rest-interfaces';
import { numberToThousandsString } from '../../../../../utils/tsx-utils';
import { prettyBytes, titleCase } from '../../../../../utils/utils';

export const MessageMetaData = observer((props: { msg: TopicMessage }) => {
  const msg = props.msg;
  const data: { [k: string]: React.ReactNode } = {
    Partition: msg.partitionID,
    Offset: numberToThousandsString(msg.offset),
    Key: msg.key.isPayloadNull ? 'Null' : `${titleCase(msg.key.encoding)} (${prettyBytes(msg.key.size)})`,
    Value: msg.value.isPayloadNull
      ? 'Null'
      : `${titleCase(msg.value.encoding)} (${msg.value.schemaId > 0 ? `${msg.value.schemaId} / ` : ''}${prettyBytes(msg.value.size)})`,
    Headers: msg.headers.length > 0 ? `${msg.headers.length}` : 'No headers set',
    Compression: msg.compression,
    Transactional: msg.isTransactional ? 'true' : 'false',
    // "Producer ID": "(msg.producerId)",
  };

  if (msg.value.schemaId) {
    data.Schema = <MessageSchema schemaId={msg.value.schemaId} />;
  }

  return (
    <Flex gap={10} my={6}>
      {Object.entries(data).map(([k, v]) => (
        <Flex direction="column" key={k} rowGap=".4em">
          <Text fontSize="md" fontWeight="600">
            {k}
          </Text>
          <Text color="" fontSize="sm">
            {v}
          </Text>
        </Flex>
      ))}
    </Flex>
  );
});
