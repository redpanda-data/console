/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Box, Button, Code, CodeBlock, Empty, Flex, Result } from '@redpanda-data/ui';

import TopicConfigurationEditor from './topic-configuration';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import type { KafkaError, Topic } from '../../../state/rest-interfaces';
import { toJson } from '../../../utils/json-utils';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import '../../../utils/array-extensions';

// todo: can we assume that config values for time and bytes will always be provided in the smallest units?
// or is it possible we'll get something like 'segment.hours' instead of 'segment.ms'?

// Full topic configuration
export function TopicConfiguration(props: { topic: Topic }) {
  const config = api.topicConfig.get(props.topic.topicName);

  if (config === undefined) {
    return DefaultSkeleton;
  }
  if (config?.error) {
    return renderKafkaError(props.topic.topicName, config.error);
  }
  if (config === null || config.configEntries.length === 0) {
    return <Empty description="No config entries" />;
  }

  const entries = config.configEntries;

  return (
    <TopicConfigurationEditor
      entries={entries}
      onForceRefresh={() => {
        api.refreshTopicConfig(props.topic.topicName, true);
      }}
      targetTopic={props.topic.topicName}
    />
  );
}

function renderKafkaError(topicName: string, error: KafkaError) {
  return (
    <Flex alignItems="center" flexDirection="column" my={8}>
      <Flex flexDirection="column" maxWidth="4xl">
        <Result
          status="error"
          subTitle={
            <>
              Redpanda Console received the following error while fetching the configuration for topic{' '}
              <Code p={1}>{topicName}</Code> from Kafka:
            </>
          }
          title="Kafka Error"
        />
        <Box m={8}>
          <CodeBlock codeString={toJson(error, 4)} language="raw" />
        </Box>
        <Button
          onClick={() => appGlobal.onRefresh()}
          size="lg"
          style={{ width: '12em', margin: '0', alignSelf: 'center' }}
          variant="solid"
        >
          Retry
        </Button>
      </Flex>
    </Flex>
  );
}
