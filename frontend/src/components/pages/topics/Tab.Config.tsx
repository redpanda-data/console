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

import React, { Component } from 'react';
import { KafkaError, ConfigEntry, Topic, ConfigEntryExtended } from '../../../state/restInterfaces';
import { Tooltip, Popover, Checkbox, Empty, Typography, Button, Result } from 'antd';
import { observer } from 'mobx-react';
import { uiSettings } from '../../../state/ui';
import Paragraph from 'antd/lib/typography/Paragraph';
import '../../../utils/arrayExtensions';
import { HighlightTwoTone } from '@ant-design/icons';
import { uiState } from '../../../state/uiState';
import { DefaultSkeleton, findPopupContainer, OptionGroup } from '../../../utils/tsxUtils';
import { api } from '../../../state/backendApi';
import { toJson } from '../../../utils/jsonUtils';
import { appGlobal } from '../../../state/appGlobal';
import { computed, makeObservable } from 'mobx';
import { formatConfigValue } from '../../../utils/formatters/ConfigValueFormatter';
import { ConfigList } from '../../misc/ConfigList';
import colors from '../../../colors';
import TopicConfigurationEditor from './TopicConfiguration';


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
                <ConfigDisplayModeSettings />
                {(uiSettings.topicList.configViewType == 'table')
                    ? <>
                        <ConfigDisplaySettings />
                        <TopicConfigList configEntries={this.configEntries} />
                    </>
                    : <>
                        <TopicConfigurationEditor
                            targetTopic={this.props.topic.topicName}
                            entries={entries}
                            onForceRefresh={() => {
                                api.refreshTopicConfig(this.props.topic.topicName, true);
                            }}
                        />
                    </>
                }
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
            <div style={{ marginBottom: '2em', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ maxWidth: '800px', display: 'flex', flexDirection: 'column' }}>
                    <Result
                        style={{ margin: 0, padding: 0, marginTop: '1em' }}
                        status="error"
                        title="Kafka Error"
                        subTitle={
                            <>
                                Redpanda Console received the following error while fetching the configuration for topic <Text code>{topicName}</Text> from Kafka:
                            </>
                        }
                    ></Result>
                    <div style={{ margin: '1.5em 0', marginTop: '1em' }}>
                        <div className="codeBox w100" style={{ padding: '0.5em 1em' }}>
                            {toJson(error, 4)}
                        </div>
                    </div>
                    <Button type="primary" size="large" onClick={() => appGlobal.onRefresh()} style={{ width: '12em', margin: '0', alignSelf: 'center' }}>
                        Retry
                    </Button>
                </div>
            </div>
        );
    }
}



const TopicConfigList = observer(({ configEntries }: { configEntries: ConfigEntry[] }) => {
    return <ConfigList
        configEntries={configEntries}
        valueDisplay={uiSettings.topicList.valueDisplay}
        renderTooltip={(e, content) => <FavoritePopover configEntry={e} children={content} />}
    />
});

const ConfigDisplayModeSettings = observer(() => (
    <div
        style={{
            marginTop: '16px',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            gap: '2em',
            rowGap: '1em',
            float: 'right',
        }}
    >
        <OptionGroup
            options={{
                'Structured View': 'structured',
                'Table View': 'table',
            }}
            value={uiSettings.topicList.configViewType}
            onChange={e => (uiSettings.topicList.configViewType = e)}
        />
    </div>
));

const ConfigDisplaySettings = observer(() => (
    <div
        style={{
            marginLeft: '1px',
            marginBottom: '1.5em',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '2em',
            rowGap: '1em',
        }}
    >
        <OptionGroup
            label="Formatting"
            options={{
                Friendly: 'friendly',
                Raw: 'raw',
            }}
            value={uiSettings.topicList.valueDisplay}
            onChange={(s) => (uiSettings.topicList.valueDisplay = s)}
        />

        <OptionGroup
            label="Sort"
            options={{
                None: 'default',
                Alphabetical: 'alphabetical',
                'Changed First': 'changedFirst',
            }}
            value={uiSettings.topicList.propsOrder}
            onChange={(s) => (uiSettings.topicList.propsOrder = s)}
        />
    </div>
));

const markerIcon = <HighlightTwoTone twoToneColor={colors.brandOrange} style={{ fontSize: '1.5em', marginRight: '.25em' }} />;

export const FavoritePopover = observer((p: { configEntry: ConfigEntry, children: React.ReactNode }) => {
    const { configEntry, children } = p;
    const name = configEntry.name;
    const favs = uiState.topicSettings.favConfigEntries;
    const isFav = favs.includes(name);
    const toggleFav = isFav ? () => favs.splice(favs.indexOf(name), 1) : () => favs.push(name);

    const docu = p.configEntry.documentation;

    const popupContent = (
        <div>
            <Paragraph style={{ maxWidth: '400px' }}>
                {docu
                    ? <div className="configPropDescription">{docu}</div>
                    : <div className="configPropDescription unknownConfigProp">No description available, unknown property</div>
                }
            </Paragraph>

            <Checkbox children="Show this setting in 'Quick Info'" checked={isFav} onChange={() => toggleFav()} />
        </div>
    );

    return (
        <Popover
            key={configEntry.name}
            placement="right"
            trigger="click"
            title={<code>{name}</code>}
            content={popupContent}
        >
            <div className="hoverLink" style={{ display: 'flex', verticalAlign: 'middle', cursor: 'pointer' }}>
                {children}
                {/* <div style={{ flexGrow: 1 }} /> */}
            </div>
        </Popover>
    );
});

export function DataValue(name: string, value: string, isDefault: boolean, formatType: 'friendly' | 'raw' | 'both') {
    value = formatConfigValue(name, value, formatType);

    if (isDefault) return <code>{value}</code>;

    return (
        <Tooltip title="Value is different from the default" getPopupContainer={findPopupContainer}>
            <div>
                {markerIcon}
                <code>{value}</code>
            </div>
        </Tooltip>
    );
}
