import React from "react";
import { KafkaError, TopicConfigEntry, TopicDetail } from "../../../state/restInterfaces";
import {
    Tooltip,
    Descriptions,
    Popover,
    Checkbox,
    Empty,
    Typography,
    Row,
    Space,
    Button,
    Result
} from "antd";
import { observer } from "mobx-react";
import { uiSettings } from "../../../state/ui";
import topicConfigInfo from "../../../assets/topicConfigInfo.json";
import Paragraph from "antd/lib/typography/Paragraph";
import "../../../utils/arrayExtensions";
import Icon, { CloseCircleOutlined, HighlightTwoTone } from '@ant-design/icons';
import { uiState } from "../../../state/uiState";
import { DefaultSkeleton, OptionGroup, toSafeString } from "../../../utils/tsxUtils";
import { api } from "../../../state/backendApi";
import { clone, prettyBytesOrNA, prettyMilliseconds, toJson } from "../../../utils/utils";
import { LockIcon } from "@primer/octicons-v2-react";
import { appGlobal } from "../../../state/appGlobal";

const { Text } = Typography;

// todo: can we assume that config values for time and bytes will always be provided in the smallest units?
// or is it possible we'll get something like 'segment.hours' instead of 'segment.ms'?

// Full topic configuration
export const TopicConfiguration = observer(
    (p: { topic: TopicDetail }) => {
        const config = api.topicConfig.get(p.topic.topicName);
        if (config === undefined) return DefaultSkeleton; // still loading
        if (config && config.error)
            return renderKafkaError(p.topic.topicName, config.error);

        if (config === null || config.configEntries.length == 0) {
            // config===null should never happen, so we catch it together with empty
            const desc = <>
                <Text type='secondary' strong style={{ fontSize: '125%' }}>No config entries</Text>
                <br />
                <span>Either the selected topic/partition did not contain any messages</span>
            </>
            return <Empty description={desc} />

            return <>
                <Empty description={null}>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h2><span><LockIcon verticalAlign='middle' size={20} /></span> Permission Denied</h2>
                        <p>
                            You are not allowed to view this page.
                            <br />
                            Contact the administrator if you think this is an error.
                        </p>
                    </div>

                    <a target="_blank" rel="noopener noreferrer" href="https://github.com/cloudhut/kowl/blob/master/docs/authorization/roles.md">
                        <Button type="primary">Kowl documentation for roles and permissions</Button>
                    </a>
                </Empty>
            </>
        }


        const configEntries = config.configEntries;

        return <>
            <ConfigDisplaySettings />
            <Descriptions
                bordered
                size="small"
                colon={true}
                layout="horizontal"
                column={1}
                style={{ display: "inline-block" }}
            >
                {configEntries.filter(e => uiSettings.topicList.propsFilter == 'onlyChanged' ? !e.isDefault : true)
                    .sort((a, b) => {
                        if (uiSettings.topicList.propsOrder != 'changedFirst') return 0;
                        const v1 = a.isDefault ? 1 : 0;
                        const v2 = b.isDefault ? 1 : 0;
                        return v1 - v2;
                    })
                    .map(e => (
                        <Descriptions.Item key={e.name} label={DataName(e)}>
                            {DataValue(e.name, e.value, e.isDefault, uiSettings.topicList.valueDisplay)}
                        </Descriptions.Item>
                    ))}
            </Descriptions>
        </>
    }
);

function renderKafkaError(topicName: string, error: KafkaError) {
    return <div style={{ marginBottom: '2em', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ maxWidth: '800px', display: 'flex', flexDirection: 'column' }}>
            <Result style={{ margin: 0, padding: 0, marginTop: '1em' }}
                status='error'
                title="Kafka Error"
                subTitle={<>Kowl received the following error while fetching the configuration for topic <Text code>{topicName}</Text> from Kafka:</>}
            >
            </Result>
            <div style={{ margin: '1.5em 0', marginTop: '1em' }}>
                <div className='codeBox w100' style={{ padding: '0.5em 1em' }}>{toJson(error, 4)}</div>
            </div>
            <Button type="primary" size="large" onClick={() => appGlobal.onRefresh()} style={{ width: '12em', margin: '0', alignSelf: 'center' }} >Retry</Button>
        </div>
    </div >
}


const ConfigDisplaySettings = observer(() =>
    <div style={{ marginLeft: '1px', marginBottom: '1.5em' }}>
        <Row>
            <Space size='large'>

                <OptionGroup label='Formatting'
                    options={{
                        "Friendly": 'friendly',
                        "Raw": 'raw'
                    }}
                    value={uiSettings.topicList.valueDisplay}
                    onChange={s => uiSettings.topicList.valueDisplay = s}
                />

                <OptionGroup label='Filter'
                    options={{
                        "Show All": 'all',
                        "Only Changed": 'onlyChanged'
                    }}
                    value={uiSettings.topicList.propsFilter}
                    onChange={s => uiSettings.topicList.propsFilter = s}
                />

                <OptionGroup label='Sort'
                    options={{
                        "None": 'default',
                        "Changed First": 'changedFirst',
                    }}
                    value={uiSettings.topicList.propsOrder}
                    onChange={s => uiSettings.topicList.propsOrder = s}
                />
            </Space>
        </Row>
    </div>);


const markerIcon = (
    <HighlightTwoTone twoToneColor="#1890ff" style={{ fontSize: "1.5em", marginRight: ".25em" }} />
);

export const FavoritePopover = (
    configEntry: TopicConfigEntry,
    children: React.ReactNode
) => {
    const name = configEntry.name;
    const favs = uiState.topicSettings.favConfigEntries;
    const isFav = favs.includes(name);
    const toggleFav = isFav
        ? () => favs.splice(favs.indexOf(name), 1)
        : () => favs.push(name);

    const infoEntry = topicConfigInfo.find(e => e.Name == name);

    const popupContent = (
        <div>
            <Paragraph style={{ maxWidth: "400px" }}>
                <b>Description</b>
                <br />
                <Text>
                    {infoEntry
                        ? infoEntry.Description
                        : "Config property '" + name + "' unknown"}
                </Text>
            </Paragraph>

            <Checkbox
                children="Show this setting in 'Quick Info'"
                checked={isFav}
                onChange={() => toggleFav()}
            />
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
            <div
                className="hoverLink"
                style={{ display: "flex", verticalAlign: "middle", cursor: "pointer" }}
            >
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

    if (isDefault) return <code>{value}</code>

    return (
        <Tooltip title="Value is different from the default">
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
        case "friendly":
            suffix = "";
            break;
        case "both":
            suffix = " (" + value + ")";
            break;

        case "raw":
        default:
            return value;
    }

    const num = Number(value);

    // Special case 1
    if (name == "flush.messages" && num > Math.pow(2, 60))
        return "Never" + suffix; // messages between each fsync

    // Special case 2
    if (name == "retention.bytes" && num < 0)
        return "Infinite" + suffix; // max bytes to keep before discarding old log segments

    // Special case 3
    if (value == "0") return value; // Don't modify zero at all


    // Time
    if (name.endsWith(".ms")) {
        // More than 100 years -> Infinite
        if (num > 3155695200000 || num == -1) return "Infinite" + suffix;
        // Convert into a readable format
        return prettyMilliseconds(num, { verbose: true }) + suffix;
    }

    // Bytes
    if (name.endsWith(".bytes")) {
        return prettyBytesOrNA(num) + suffix;
    }

    // Ratio
    if (name.endsWith(".ratio")) {
        return (num * 100).toLocaleString() + "%"
    }

    return value;
}
