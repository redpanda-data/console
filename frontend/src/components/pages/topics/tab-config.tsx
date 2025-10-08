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

import { observer } from 'mobx-react';
import { Component } from 'react';

import type { ConfigEntryExtended, KafkaError, Topic } from '../../../state/rest-interfaces';
import { uiSettings } from '../../../state/ui';
import '../../../utils/array-extensions';
import { Box, Button, Code, CodeBlock, Empty, Flex, Result } from '@redpanda-data/ui';
import { computed, makeObservable } from 'mobx';

import TopicConfigurationEditor from './topic-configuration';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import { toJson } from '../../../utils/json-utils';
import { DefaultSkeleton } from '../../../utils/tsx-utils';

// todo: can we assume that config values for time and bytes will always be provided in the smallest units?
// or is it possible we'll get something like 'segment.hours' instead of 'segment.ms'?

// Full topic configuration
@observer
export class TopicConfiguration extends Component<{
  topic: Topic;
}> {
  constructor(p: { topic: Topic }) {
    super(p);
    makeObservable(this);
  }

  render() {
    const renderedError = this.handleError();
    if (renderedError) {
      return renderedError;
    }

    const entries = api.topicConfig.get(this.props.topic.topicName)?.configEntries ?? [];

    return (
      <TopicConfigurationEditor
        entries={entries}
        onForceRefresh={() => {
          api.refreshTopicConfig(this.props.topic.topicName, true);
        }}
        targetTopic={this.props.topic.topicName}
      />
    );
  }

  @computed get configEntries(): ConfigEntryExtended[] {
    const config = api.topicConfig.get(this.props.topic.topicName);
    if (config == null) {
      return [];
    }

    return config.configEntries.slice().sort((a, b) => {
      switch (uiSettings.topicList.propsOrder) {
        case 'default':
          return 0;
        case 'alphabetical':
          return a.name.localeCompare(b.name);
        case 'changedFirst': {
          if (uiSettings.topicList.propsOrder !== 'changedFirst') {
            return 0;
          }
          const v1 = a.isExplicitlySet ? 1 : 0;
          const v2 = b.isExplicitlySet ? 1 : 0;
          return v2 - v1;
        }
        default:
          return 0;
      }
    });
  }

  handleError(): JSX.Element | null {
    const config = api.topicConfig.get(this.props.topic.topicName);
    if (config === undefined) {
      return DefaultSkeleton; // still loading
    }
    if (config?.error) {
      return this.renderKafkaError(this.props.topic.topicName, config.error);
    }

    if (config === null || config.configEntries.length === 0) {
      // config===null should never happen, so we catch it together with empty
      return <Empty description="No config entries" />;
    }
    return null;
  }

  renderKafkaError(topicName: string, error: KafkaError) {
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
}
