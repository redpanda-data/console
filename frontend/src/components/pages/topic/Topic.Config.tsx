import { Component, ReactNode } from "react";
import React from "react";
import { TopicDetail, TopicConfigEntry, TopicMessage } from "../../../state/restInterfaces";
import { Table, Tooltip, Icon, Row, Statistic, Tabs, Descriptions, Popover, Skeleton, Radio, Checkbox, Button, Select, Input, Form, Divider, Typography, message, Tag, Drawer, Result, Alert, Empty, ConfigProvider } from "antd";
import { observer } from "mobx-react";
import { api, TopicMessageOffset, TopicMessageSortBy, TopicMessageDirection, TopicMessageSearchParameters } from "../../../state/backendApi";
import { uiSettings, PreviewTag } from "../../../state/ui";
import ReactJson, { CollapsedFieldProps } from 'react-json-view'
import { PageComponent, PageInitHelper } from "../Page";
import prettyMilliseconds from 'pretty-ms';
import prettyBytes from 'pretty-bytes';
import topicConfigInfo from '../../../assets/topicConfigInfo.json'
import { sortField, range, makePaginationConfig, Spacer } from "../../misc/common";
import { motion, AnimatePresence } from "framer-motion";
import { observable, computed, transaction } from "mobx";
import { findElementDeep, cullText, getAllKeys } from "../../../utils/utils";
import { FormComponentProps } from "antd/lib/form";
import { animProps, MotionAlways, MotionDiv } from "../../../utils/animationProps";
import Paragraph from "antd/lib/typography/Paragraph";
import { ColumnProps } from "antd/lib/table";
import '../../../utils/arrayExtensions';
import { uiState } from "../../../state/uiState";
import { FilterableDataSource } from "../../../utils/filterableDataSource";

const { Text } = Typography;
const { Option } = Select;
const InputGroup = Input.Group;

// todo: can we assume that config values for time and bytes will always be provided in the smallest units?
// or is it possible we'll get something like 'segment.hours' instead of 'segment.ms'?

// Full topic configuration
export const TopicConfiguration = observer((p: { config: TopicConfigEntry[] }) =>
    <Descriptions bordered size='small' colon={true} layout='horizontal' column={1} style={{ display: 'inline-block' }}>
        {
            p.config.filter(e => uiSettings.topicList.onlyShowChanged ? !e.isDefault : true).map((e) =>
                <Descriptions.Item key={e.name} label={DataName(e)} >{DataValue(e)}</Descriptions.Item>
            )
        }
    </Descriptions>
)

const markerIcon = <Icon type="highlight" theme="twoTone" twoToneColor="#1890ff" style={{ fontSize: '1.5em', marginRight: '.25em' }} />


export const FavoritePopover = (configEntry: TopicConfigEntry, children: React.ReactNode) => {

    const name = configEntry.name;
    const favs = uiState.topicDetails.favConfigEntries;
    const isFav = favs.includes(name);
    const toggleFav = isFav
        ? () => favs.splice(favs.indexOf(name), 1)
        : () => favs.push(name);

    const infoEntry = topicConfigInfo.find(e => e.Name == name);

    const popupContent = <div>
        <Paragraph style={{ maxWidth: '400px' }}>
            <b>Description</b><br />
            <Text>{infoEntry ? infoEntry.Description : "Config property '" + name + "' unknown"}</Text>
        </Paragraph>

        <Checkbox
            children="Show this setting in 'Quick Info'"
            checked={isFav}
            onChange={() => toggleFav()}
        />

    </div>

    return (
        <Popover key={configEntry.name} placement='right' trigger='click' title={<>Config <Text code>{name}</Text></>} content={popupContent}>
            <div className='hoverLink' style={{ display: 'flex', verticalAlign: 'middle', cursor: 'pointer' }}>
                {children}
                {/* <div style={{ flexGrow: 1 }} /> */}
            </div>
        </Popover>
    )
}

function DataName(configEntry: TopicConfigEntry) {
    return FavoritePopover(configEntry, configEntry.name);
}

function DataValue(configEntry: TopicConfigEntry) {
    const value = FormatValue(configEntry);

    if (configEntry.isDefault) {
        return <code>{value}</code>
    }

    return (
        <Tooltip title="Value is different from the default">
            {markerIcon}
            <code>{value}</code>
        </Tooltip>
    )
}

export function FormatValue(configEntry: TopicConfigEntry): string {
    const value = configEntry.value;
    let suffix: string;

    switch (uiSettings.topicList.valueDisplay) {
        case 'friendly': suffix = ''; break;
        case 'both': suffix = ' (' + value + ')'; break;

        case 'raw':
        default:
            return configEntry.value;
    }

    const num = Number(value);


    // Special cases for known configuration entries
    if (configEntry.name == 'flush.messages' && num > Math.pow(2, 60))
        return 'Never' + suffix;

    // Don't modify zero at all
    if (value === '0')
        return value;

    // Time
    if (configEntry.name.endsWith('.ms')) {
        // More than 100 years -> Infinite
        if (num > 3155695200000) return 'Infinite' + suffix;
        // Convert into a readable format
        return prettyMilliseconds(num, { verbose: true, }) + suffix;
    }

    // Bytes
    if (configEntry.name.endsWith('.bytes')) {
        return prettyBytes(num) + suffix;
    }

    return value;
}
