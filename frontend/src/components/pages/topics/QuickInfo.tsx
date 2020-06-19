import { Component, ReactNode, CSSProperties } from "react";
import React from "react";
import { TopicDetail, TopicConfigEntry, TopicMessage } from "../../../state/restInterfaces";
import { Table, Tooltip, Row, Statistic, Tabs, Descriptions, Popover, Skeleton, Radio, Checkbox, Button, Select, Input, Form, Divider, Typography, message, Tag, Drawer, Result, Alert, Empty, ConfigProvider } from "antd";
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
import { animProps, MotionAlways, MotionDiv } from "../../../utils/animationProps";
import Paragraph from "antd/lib/typography/Paragraph";
import { ColumnProps } from "antd/lib/table";
import '../../../utils/arrayExtensions';
import { uiState } from "../../../state/uiState";
import { FilterableDataSource } from "../../../utils/filterableDataSource";
import { FavoritePopover, FormatValue } from "./Tab.Config";


// todo: rename QuickInfo
export const TopicQuickInfoStatistic = observer((p: { topicName: string }) => {

    const topic = api.Topics?.first(t => t.topicName == p.topicName);
    if (topic === undefined) return null; // not ready yet

    const topicConfig = api.TopicConfig.get(p.topicName);

    const partitions = api.TopicPartitions.get(p.topicName);
    let messageSum: null | string;
    if (partitions === undefined) messageSum = '...'; // waiting...
    else if (partitions === null) messageSum = null; // hide
    else messageSum = partitions.sum(p => (p.waterMarkHigh - p.waterMarkLow)).toString();


    return <Row >

        <Statistic title='Size' value={prettyBytes(topic.logDirSize)} />
        {messageSum && <Statistic title='Messages' value={messageSum} />}

        {uiState.topicSettings.favConfigEntries.filter(tce => !!tce).length > 0
            ? <div style={{ width: '1px', background: '#8883', margin: '0 1.5rem', marginLeft: 0 }} />
            : null}

        {
            topicConfig && uiState.topicSettings.favConfigEntries
                .map(fav => topicConfig.find(tce => tce.name === fav))
                .filter(tce => tce)
                .map(configEntry =>
                    FavoritePopover(configEntry!, <Statistic title={(configEntry!.name)} value={FormatValue(configEntry!)} />)
                )
        }
    </Row>
})
