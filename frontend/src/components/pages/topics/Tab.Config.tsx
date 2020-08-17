import React from "react";
import { TopicConfigEntry, TopicDetail } from "../../../state/restInterfaces";
import {
    Tooltip,
    Descriptions,
    Popover,
    Checkbox,
    Select,
    Input,
    Typography,
    Row,
    Space
} from "antd";
import { observer } from "mobx-react";
import { uiSettings } from "../../../state/ui";
import prettyMilliseconds from "pretty-ms";
import prettyBytes from "pretty-bytes";
import topicConfigInfo from "../../../assets/topicConfigInfo.json";
import Paragraph from "antd/lib/typography/Paragraph";
import "../../../utils/arrayExtensions";
import Icon, { HighlightTwoTone } from '@ant-design/icons';
import { uiState } from "../../../state/uiState";
import { OptionGroup } from "../../../utils/tsxUtils";
import { api } from "../../../state/backendApi";

const { Text } = Typography;

// todo: can we assume that config values for time and bytes will always be provided in the smallest units?
// or is it possible we'll get something like 'segment.hours' instead of 'segment.ms'?

// Full topic configuration
export const TopicConfiguration = observer(
    (p: { topic: TopicDetail }) => {
        const config = api.TopicConfig.get(p.topic.topicName);

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
                {config && config.filter(e => uiSettings.topicList.propsFilter == 'onlyChanged' ? !e.isDefault : true)
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
        return prettyBytes(num) + suffix;
    }

    // Ratio
    if (name.endsWith(".ratio")) {
        return (num * 100).toLocaleString() + "%"
    }

    return value;
}
