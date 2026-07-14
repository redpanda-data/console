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

import { Button } from 'components/redpanda-ui/components/button';
import { CodeBlock, Pre } from 'components/redpanda-ui/components/code-block';
import { Empty, EmptyDescription } from 'components/redpanda-ui/components/empty';

import TopicConfigurationEditor from './topic-configuration';
import { appGlobal } from '../../../state/app-global';
import { api, useApiStoreHook } from '../../../state/backend-api';
import type { KafkaError, Topic } from '../../../state/rest-interfaces';
import { toJson } from '../../../utils/json-utils';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import '../../../utils/array-extensions';

// todo: can we assume that config values for time and bytes will always be provided in the smallest units?
// or is it possible we'll get something like 'segment.hours' instead of 'segment.ms'?

// Full topic configuration
export function TopicConfiguration(props: { topic: Topic }) {
  const config = useApiStoreHook((s) => s.topicConfig.get(props.topic.topicName));

  if (config === undefined) {
    return DefaultSkeleton;
  }
  if (config?.error) {
    return renderKafkaError(props.topic.topicName, config.error);
  }
  if (config === null || config.configEntries.length === 0) {
    return (
      <Empty>
        <EmptyDescription>No config entries</EmptyDescription>
      </Empty>
    );
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
    <div className="my-8 flex flex-col items-center">
      <div className="flex w-full max-w-4xl flex-col">
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="font-semibold text-destructive text-xl">Kafka Error</h2>
          <p className="text-muted-foreground">
            Redpanda Console received the following error while fetching the configuration for topic{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-sm">{topicName}</code> from Kafka:
          </p>
        </div>
        <div className="m-8">
          <CodeBlock width="full">
            <Pre>
              <code>{toJson(error, 4)}</code>
            </Pre>
          </CodeBlock>
        </div>
        <Button className="w-48 self-center" onClick={() => appGlobal.onRefresh()} size="lg">
          Retry
        </Button>
      </div>
    </div>
  );
}
