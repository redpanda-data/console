import { Component, ReactNode, CSSProperties } from "react";
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
import { FavoritePopover, FormatValue } from "./Topic.Config";

const { Text } = Typography;
const { Option } = Select;
const InputGroup = Input.Group;

const statsStyle: CSSProperties = { margin: 0, marginRight: '2em', padding: '.2em' };

// todo: rename QuickInfo
export const TopicQuickInfoStatistic = observer((p: { config: TopicConfigEntry[], size: number }) =>
    <Row type="flex" style={{ marginBottom: '1em' }}>

        <Statistic title='Size' value={prettyBytes(p.size)} style={statsStyle}/>

        {p.config.filter(e => uiState.topicDetails.favConfigEntries.includes(e.name)).map((e) =>
            FavoritePopover(e, (
                <div style={statsStyle}>
                    <Statistic title={(e.name)} value={FormatValue(e)} />
                </div>
            ))
        )
        }
    </Row>
)
