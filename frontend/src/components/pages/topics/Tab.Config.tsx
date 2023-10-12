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

import { Component } from 'react';
import { ConfigEntryExtended, KafkaError, Topic } from '../../../state/restInterfaces';
import { Empty, Typography } from 'antd';
import { observer } from 'mobx-react';
import { uiSettings } from '../../../state/ui';
import '../../../utils/arrayExtensions';
import { HighlightTwoTone } from '@ant-design/icons';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { api } from '../../../state/backendApi';
import { toJson } from '../../../utils/jsonUtils';
import { appGlobal } from '../../../state/appGlobal';
import { computed, makeObservable } from 'mobx';
import { formatConfigValue } from '../../../utils/formatters/ConfigValueFormatter';
import colors from '../../../colors';
import TopicConfigurationEditor from './TopicConfiguration';
import { Box, Button, Code, CodeBlock, Flex, Result, Tooltip } from '@redpanda-data/ui';

const { Text } = Typography;

// todo: can we assume that config values for time and bytes will always be provided in the smallest units?
// or is it possible we'll get something like 'segment.hours' instead of 'segment.ms'?

// Full topic configuration
@observer
export class TopicConfiguration extends Component<{
    topic: Topic
}> {

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }


    render() {
        const renderedError = this.handleError();
        if (renderedError) return renderedError;

        const entries = api.topicConfig.get(this.props.topic.topicName)?.configEntries ?? [];

        return (
            <>
                <TopicConfigurationEditor
                    targetTopic={this.props.topic.topicName}
                    entries={entries}
                    onForceRefresh={() => {
                        api.refreshTopicConfig(this.props.topic.topicName, true);
                    }}
                />
            </>
        );
    }

    @computed get configEntries(): ConfigEntryExtended[] {
        const config = api.topicConfig.get(this.props.topic.topicName);
        if (config == null) return [];

        return config.configEntries
            .slice().sort((a, b) => {
                switch (uiSettings.topicList.propsOrder) {
                    case 'default':
                        return 0;
                    case 'alphabetical':
                        return a.name.localeCompare(b.name);
                    case 'changedFirst':
                        if (uiSettings.topicList.propsOrder != 'changedFirst') return 0;
                        const v1 = a.isExplicitlySet ? 1 : 0;
                        const v2 = b.isExplicitlySet ? 1 : 0;
                        return v2 - v1;
                    default: return 0;
                }
            });
    }

    handleError(): JSX.Element | null {
        const config = api.topicConfig.get(this.props.topic.topicName);
        if (config === undefined) return DefaultSkeleton; // still loading
        if (config && config.error) return this.renderKafkaError(this.props.topic.topicName, config.error);

        if (config === null || config.configEntries.length == 0) {
            // config===null should never happen, so we catch it together with empty
            const desc = (
                <>
                    <Text type="secondary" strong style={{ fontSize: '125%' }}>
                        No config entries
                    </Text>
                    <br />
                </>
            );
            return <Empty description={desc} />;
        }
        return null;
    }

    renderKafkaError(topicName: string, error: KafkaError) {
        return (
            <Flex my={8} flexDirection="column" alignItems="center">
                <Flex flexDirection="column" maxWidth="4xl">
                    <Result
                        status="error"
                        title="Kafka Error"
                        subTitle={
                            <>
                                Redpanda Console received the following error while fetching the configuration for topic <Code p={1}>{topicName}</Code> from Kafka:
                            </>
                        }
                    />
                    <Box m={8}>
                        <CodeBlock language="raw" codeString={toJson(error, 4)} />
                    </Box>
                    <Button variant="solid" size="lg" onClick={() => appGlobal.onRefresh()} style={{width: '12em', margin: '0', alignSelf: 'center'}}>
                        Retry
                    </Button>
                </Flex>
            </Flex>
        );
    }
}

const markerIcon = <HighlightTwoTone twoToneColor={colors.brandOrange} style={{ fontSize: '1.5em', marginRight: '.25em' }} />;

export function DataValue(name: string, value: string, isDefault: boolean, formatType: 'friendly' | 'raw' | 'both') {
    value = formatConfigValue(name, value, formatType);

    if (isDefault) return <code>{value}</code>;

    return (
        <Tooltip label="Value is different from the default">
            <div>
                {markerIcon}
                <code>{value}</code>
            </div>
        </Tooltip>
    );
}
