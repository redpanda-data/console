import React, { Component } from 'react';
import { KafkaError, TopicConfigEntry, Topic } from '../../../state/restInterfaces';
import { Tooltip, Descriptions, Popover, Checkbox, Empty, Typography, Row, Space, Button, Result, Table } from 'antd';
import { observer } from 'mobx-react';
import { uiSettings } from '../../../state/ui';
import topicConfigInfo from '../../../assets/topicConfigInfo.json';
import Paragraph from 'antd/lib/typography/Paragraph';
import '../../../utils/arrayExtensions';
import Icon, { CloseCircleOutlined, HighlightTwoTone } from '@ant-design/icons';
import { uiState } from '../../../state/uiState';
import { DefaultSkeleton, findPopupContainer, OptionGroup, toSafeString } from '../../../utils/tsxUtils';
import { api } from '../../../state/backendApi';
import { prettyBytesOrNA, prettyMilliseconds } from '../../../utils/utils';
import { clone, toJson } from '../../../utils/jsonUtils';
import { LockIcon } from '@primer/octicons-v2-react';
import { appGlobal } from '../../../state/appGlobal';
import { computed } from 'mobx';
import styles from './TabConfig.module.scss';

const { Text } = Typography;

// todo: can we assume that config values for time and bytes will always be provided in the smallest units?
// or is it possible we'll get something like 'segment.hours' instead of 'segment.ms'?

// Full topic configuration
@observer
export class TopicConfiguration extends Component<{ topic: Topic }> {
    render() {
        const renderedError = this.handleError();
        if (renderedError) return renderedError;

        const configEntries = this.configEntries;

        const singleColumn = uiSettings.topicList.configColumns == 1 || configEntries.length < 6;

        let descriptions: JSX.Element;
        if (singleColumn) {
            // Single column
            descriptions = this.renderConfigList(configEntries);
        } else {
            // Double column
            const middle = Math.ceil(configEntries.length / 2);
            const first = configEntries.slice(0, middle);
            const second = configEntries.slice(middle);

            descriptions = (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2em' }}>
                    {this.renderConfigList(first)}
                    {this.renderConfigList(second)}
                </div>
            );
        }

        return (
            <>
                <ConfigDisplaySettings />
                {descriptions}
            </>
        );
    }

    renderConfigList(configEntries: TopicConfigEntry[]): JSX.Element {
        const columns = [
            { title: 'Configuration', dataIndex: 'name', render: (text: string) => <span className={styles.name}>{text}</span> },
            { title: 'Value', dataIndex: 'value', render: (_: unknown, record: Partial<TopicConfigEntry>) => FormatConfigValue(record.name as string, record.value as string, uiSettings.topicList.valueDisplay) },
            { title: 'Type', dataIndex: 'type', render: (text: string) => <span className={styles.type}>{text?.toLowerCase()}</span> },
            {
                title: 'Source',
                dataIndex: 'source',
                render: (text: string) =>
                    text
                        .toLowerCase()
                        .split('_')
                        .map((s) => s.replace(/^\w/, (c) => c.toUpperCase()))
                        .join(' '),
            },
        ];
        return (
            <Table
                rowKey="name"
                dataSource={configEntries.map(filterRedundantSynonyms)}
                childrenColumnName="synonyms"
                columns={columns}
                rowClassName={(record) => (record.isExplicitlySet ? styles.overidden : styles.default)}
            />
        );
    }

    @computed get configEntries(): TopicConfigEntry[] {
        const config = api.topicConfig.get(this.props.topic.topicName);
        if (config == null) return [];

        return config.configEntries
            .filter((e) => (uiSettings.topicList.propsFilter == 'onlyChanged' ? !e.isExplicitlySet : true))
            .sort((a, b) => {
                switch (uiSettings.topicList.propsOrder) {
                    case 'default':
                        return 0;
                    case 'alphabetical':
                        return a.name.localeCompare(b.name);
                    case 'changedFirst':
                        if (uiSettings.topicList.propsOrder != 'changedFirst') return 0;
                        const v1 = a.isExplicitlySet ? 1 : 0;
                        const v2 = b.isExplicitlySet ? 1 : 0;
                        return v1 - v2;
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
                                Kowl received the following error while fetching the configuration for topic <Text code>{topicName}</Text> from Kafka:
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
            label="Filter"
            options={{
                'Show All': 'all',
                'Only Changed': 'onlyChanged',
            }}
            value={uiSettings.topicList.propsFilter}
            onChange={(s) => (uiSettings.topicList.propsFilter = s)}
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

        <OptionGroup
            label="Display Columns"
            options={{
                Single: 1,
                Double: 2,
            }}
            value={uiSettings.topicList.configColumns}
            onChange={(s) => (uiSettings.topicList.configColumns = s)}
        />
    </div>
));

const markerIcon = <HighlightTwoTone twoToneColor="#1890ff" style={{ fontSize: '1.5em', marginRight: '.25em' }} />;

export const FavoritePopover = (configEntry: TopicConfigEntry, children: React.ReactNode) => {
    const name = configEntry.name;
    const favs = uiState.topicSettings.favConfigEntries;
    const isFav = favs.includes(name);
    const toggleFav = isFav ? () => favs.splice(favs.indexOf(name), 1) : () => favs.push(name);

    const infoEntry = topicConfigInfo.find((e) => e.Name == name);

    const popupContent = (
        <div>
            <Paragraph style={{ maxWidth: '400px' }}>
                <b>Description</b>
                <br />
                <Text>{infoEntry ? infoEntry.Description : "Config property '" + name + "' unknown"}</Text>
            </Paragraph>

            <Checkbox children="Show this setting in 'Quick Info'" checked={isFav} onChange={() => toggleFav()} />
        </div>
    );

    return (
        <Popover
            key={configEntry.name}
            placement="right"
            trigger="click"
            title={
                <>
                    Config <Text code>{name}</Text>
                </>
            }
            content={popupContent}
        >
            <div className="hoverLink" style={{ display: 'flex', verticalAlign: 'middle', cursor: 'pointer' }}>
                {children}
                {/* <div style={{ flexGrow: 1 }} /> */}
            </div>
        </Popover>
    );
};

function DataName(configEntry: TopicConfigEntry) {
    return FavoritePopover(configEntry, configEntry.name);
}

export function DataValue(name: string, value: string, isDefault: boolean, formatType: 'friendly' | 'raw' | 'both') {
    value = FormatConfigValue(name, value, formatType);

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

export function FormatConfigValue(name: string, value: string, formatType: 'friendly' | 'raw' | 'both'): string {
    let suffix: string;

    switch (formatType) {
        case 'friendly':
            suffix = '';
            break;
        case 'both':
            suffix = ' (' + value + ')';
            break;

        case 'raw':
        default:
            return value;
    }

    //
    // String
    //
    if (name == "advertised.listeners" || name == "listener.security.protocol.map" || name == "listeners") {
        const listeners = value.split(',');
        return listeners.length > 1
            ? "\n" + listeners.join('\n')
            : listeners.join('\n');
    }


    //
    // Numeric
    //
    const num = Number(value);
    if (value == null || value == "" || value == "0" || Number.isNaN(num))
        return value;

    // Special cases
    if (name == 'flush.messages' && num > Math.pow(2, 60)) return 'Never' + suffix; // messages between each fsync

    if (name.endsWith('.bytes.per.second')) {
        if (num >= Number.MAX_SAFE_INTEGER) return 'Infinite' + suffix;
        return prettyBytesOrNA(num) + '/s' + suffix;
    }

    // Time
    const timeExtensions: [string, number][] = [
        // name ending -> conversion to milliseconds
        [".ms", 1],
        [".seconds", 1000],
        [".minutes", 60 * 1000],
        [".hours", 60 * 60 * 1000],
        [".days", 24 * 60 * 60 * 1000],
    ]
    for (const [ext, msFactor] of timeExtensions) {
        if (!name.endsWith(ext)) continue;
        if (num > Number.MAX_SAFE_INTEGER || num == -1) return "Infinite" + suffix;

        const ms = num * msFactor;
        return prettyMilliseconds(ms, { verbose: true }) + suffix;
    }

    // Bytes
    if (name.endsWith('.bytes') || name.endsWith('.buffer.size') || name.endsWith('.replication.throttled.rate') || name.endsWith('.reassignment.throttled.rate')) {
        if (num < 0 || num >= Number.MAX_VALUE) return 'Infinite' + suffix;
        return prettyBytesOrNA(num) + suffix;
    }

    // Ratio
    if (name.endsWith('.ratio')) {
        return (num * 100).toLocaleString() + '%';
    }

    return value;
}

function filterRedundantSynonyms({ synonyms, ...rest }: TopicConfigEntry): Partial<TopicConfigEntry> {
    if (synonyms?.length <= 1) {
        return rest;
    }

    return { ...rest, synonyms: synonyms.slice(1)}
}
