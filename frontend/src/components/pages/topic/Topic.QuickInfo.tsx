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
import { FavoritePopover, FormatValue } from "./Topic.Config";


// todo: rename QuickInfo
export const TopicQuickInfoStatistic = observer((p: { config: TopicConfigEntry[], size: number, messageCount: string | null }) => {

    return <Row >

        <Statistic title='Size' value={prettyBytes(p.size)} />
        {p.messageCount && <Statistic title='Messages' value={p.messageCount} />}

        {uiState.topicSettings.favConfigEntries.filter(tce => !!tce).length > 0
            && <div style={{ width: '1px', background: '#8883', margin: '0 1.5rem', marginLeft: 0 }} />}

        {
            uiState.topicSettings.favConfigEntries
                .map(fce => p.config.find(tce => tce.name === fce))
                .filter(tce => !!tce)
                .map(tce =>
                    FavoritePopover(tce!, <Statistic title={(tce!.name)} value={FormatValue(tce!)} />)
                )
        }
    </Row>
})
