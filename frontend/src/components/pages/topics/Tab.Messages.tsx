import { Component, ReactNode } from "react";
import React from "react";
import { TopicDetail, TopicConfigEntry, TopicMessage } from "../../../state/restInterfaces";
import { Table, Tooltip, Row, Statistic, Tabs, Descriptions, Popover, Skeleton, Radio, Checkbox, Button, Select, Input, Form, Divider, Typography, message, Tag, Alert, Empty, ConfigProvider, Modal, AutoComplete, Space, Dropdown, Menu } from "antd";
import { observer } from "mobx-react";
import { api, TopicMessageOffset, TopicMessageSortBy, TopicMessageDirection, TopicMessageSearchParameters } from "../../../state/backendApi";
import { uiSettings, PreviewTag } from "../../../state/ui";
import ReactJson, { CollapsedFieldProps } from 'react-json-view'
import { PageComponent, PageInitHelper } from "../Page";
import prettyMilliseconds from 'pretty-ms';
import prettyBytes from 'pretty-bytes';
import { sortField, range, makePaginationConfig, Spacer } from "../../misc/common";
import { motion, AnimatePresence } from "framer-motion";
import { observable, computed, transaction, autorun, IReactionDisposer, untracked } from "mobx";
import { findElementDeep, cullText, getAllKeys, ToJson, simpleUniqueId } from "../../../utils/utils";
import { animProps, MotionAlways, MotionDiv, MotionSpan, animProps_span_messagesStatus } from "../../../utils/animationProps";
import Paragraph from "antd/lib/typography/Paragraph";
import { ColumnProps } from "antd/lib/table";
import '../../../utils/arrayExtensions';
import { FilterableDataSource } from "../../../utils/filterableDataSource";
import { uiState } from "../../../state/uiState";
import { appGlobal } from "../../../state/appGlobal";
import qs from 'query-string';
import url, { URL, parse as parseUrl, format as formatUrl } from "url";
import { editQuery } from "../../../utils/queryHelper";
import { numberToThousandsString, ZeroSizeWrapper, Label, OptionGroup } from "../../../utils/tsxUtils";

import Octicon, { Skip, Sync, ChevronDown, Play, ChevronRight } from '@primer/octicons-react';
import { SyncIcon, PlayIcon, ChevronRightIcon, ArrowRightIcon, HorizontalRuleIcon, DashIcon, CircleIcon } from '@primer/octicons-v2-react'
import { ReactComponent as SvgCircleStop } from '../../../assets/circle-stop.svg';

import queryString, { ParseOptions, StringifyOptions, ParsedQuery } from 'query-string';
import Icon, { SettingOutlined, FilterOutlined, DeleteOutlined, PlusOutlined, CopyOutlined, LinkOutlined, ReloadOutlined, UserOutlined, PlayCircleFilled, DoubleRightOutlined, PlayCircleOutlined, VerticalAlignTopOutlined } from '@ant-design/icons';
import { ErrorBoundary } from "../../misc/ErrorBoundary";
import { SortOrder } from "antd/lib/table/interface";

const { Text } = Typography;
const { Option } = Select;
const InputGroup = Input.Group;

/*
    TODO:
        - when the user has entered a specific offset, we should prevent selecting 'all' partitions, as that wouldn't make any sense.
        - add back summary of quick search  <this.FilterSummary />
*/

@observer
export class TopicMessageView extends Component<{ topic: TopicDetail }> {

    @observable requestInProgress = false;
    @observable previewDisplay: string[] = [];
    @observable allCurrentKeys: string[] = [];
    @observable showPreviewSettings = false;

    @observable fetchError = null as Error | null;

    pageConfig = makePaginationConfig(uiState.topicSettings.messagesPageSize);
    messageSource = new FilterableDataSource<TopicMessage>(() => api.Messages, this.isFilterMatch, 16);

    autoSearchReaction: IReactionDisposer | null = null;
    quickSearchReaction: IReactionDisposer | null = null;

    currentSearchRun: string | null = null;

    constructor(props: { topic: TopicDetail }) {
        super(props);
        this.executeMessageSearch = this.executeMessageSearch.bind(this); // needed because we must pass the function directly as 'submit' prop
    }

    componentDidMount() {
        // unpack query parameters (if any)
        const searchParams = uiState.topicSettings.searchParams;
        const query = qs.parse(window.location.search);
        console.log("parsing query: " + ToJson(query));
        if (query.p != null) searchParams.partitionID = Number(query.p);
        if (query.s != null) searchParams.pageSize = Number(query.s);
        if (query.o != null) {
            searchParams.startOffset = Number(query.o);
            searchParams._offsetMode = (searchParams.startOffset >= 0) ? TopicMessageOffset.Custom : searchParams.startOffset;
        }
        if (query.q != null) uiState.topicSettings.quickSearch = String(query.q);

        // Auto search when parameters change

        this.autoSearchReaction = autorun(() => this.searchFunc('auto'), { delay: 100, name: 'auto search when parameters change' });

        // Quick search -> url
        this.quickSearchReaction = autorun(() => {
            editQuery(query => {
                const q = String(uiState.topicSettings.quickSearch);
                query["q"] = q ? q : undefined;
            })
        }, { name: 'update query string' });

        this.messageSource.filterText = uiState.topicSettings.quickSearch;
    }
    componentWillUnmount() {
        this.messageSource.dispose();
        if (this.autoSearchReaction)
            this.autoSearchReaction();
        if (this.quickSearchReaction)
            this.quickSearchReaction();
    }

    render() {
        return <>
            <this.SearchControlsBar />

            {/* Message Table (or error display) */}
            {this.fetchError
                ? <Alert
                    type="error" showIcon
                    message="Backend API Error"
                    description={<div>
                        <Text>Please check and modify the request before resubmitting.</Text>
                        <div className='codeBox'>{this.fetchError.message}</div>
                        <Button onClick={() => this.executeMessageSearch()}>
                            Retry Search
                        </Button>
                    </div>}
                />
                : <>
                    <Row align='middle' style={{ marginBottom: '0rem', display: 'flex', alignItems: 'center' }} >
                        {/*
                            todo: move this below the table (aligned left)
                            This requires more work becasue we'd have to remove the pagination controls from the table and provide our own
                         */}
                        {/* <this.SearchQueryAdditionalInfo /> */}
                    </Row>

                    <this.MessageTable />
                </>
            }
        </>
    }

    SearchControlsBar = observer(() => {
        const searchParams = uiState.topicSettings.searchParams;
        const topic = this.props.topic;
        const spaceStyle = { marginRight: '16px', marginTop: '12px' };
        return <React.Fragment>
            <div style={{ margin: '0 1px', marginBottom: '12px', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {/* Search Settings*/}
                <Label text='Partition' style={{ ...spaceStyle }}>
                    <Select<number> value={searchParams.partitionID} onChange={c => searchParams.partitionID = c} style={{ width: '9em' }}>
                        <Select.Option key='all' value={-1}>All</Select.Option>
                        {range(0, topic.partitionCount).map(i =>
                            <Select.Option key={i} value={i}>Partition {i.toString()}</Select.Option>)}
                    </Select>
                </Label>
                <Label text='Max Results' style={{ ...spaceStyle }}>
                    <Select<number> value={searchParams.pageSize} onChange={c => searchParams.pageSize = c} style={{ width: '10em' }}>
                        {[1, 3, 5, 10, 20, 50, 100, 200, 500].map(i => <Select.Option key={i} value={i}>{i.toString()} results</Select.Option>)}
                    </Select>
                </Label>
                <Label text='Offset' style={{ ...spaceStyle }}>
                    <InputGroup compact style={{ display: 'inline-block', width: 'auto' }}>
                        <Select<TopicMessageOffset> value={searchParams._offsetMode} onChange={e => searchParams._offsetMode = e}
                            dropdownMatchSelectWidth={false} style={{ width: '10em' }}>
                            <Option value={TopicMessageOffset.End}>Newest Offset</Option>
                            <Option value={TopicMessageOffset.Start}>Oldest Offset</Option>
                            <Option value={TopicMessageOffset.Custom}>Custom Offset</Option>
                        </Select>
                        {
                            searchParams._offsetMode == TopicMessageOffset.Custom &&
                            <Input style={{ width: '8em' }} maxLength={20}
                                value={searchParams.startOffset} onChange={e => searchParams.startOffset = +e.target.value}
                                disabled={searchParams._offsetMode != TopicMessageOffset.Custom} />
                        }
                    </InputGroup>
                </Label>

                {/* Refresh Button */}
                <div style={{ ...spaceStyle }}>
                    <Tooltip title='Repeat current search'>
                        <Button type='primary' onClick={() => this.searchFunc('manual')} disabled={api.MessageSearchPhase != null}>
                            <SyncIcon size={16} />
                        </Button>
                    </Tooltip>
                </div>

                {/* Button (live search?) */}
                {/* <div style={{ ...spaceStyle }}>
                    <Input.Group compact>
                        <Tooltip title='Load more messages'>
                            <Button type='primary' className='messagesSpecialIconButton'>
                                <span style={{ height: '100%' }}><ArrowRightIcon size={16} /></span>
                                <span style={{ height: '100%', marginLeft: '-11px', transform: 'rotate(90deg)' }} ><DashIcon size={18} /></span>
                            </Button>
                        </Tooltip>
                        <Tooltip title='Start live updating'>
                            <Button type='primary' className='messagesSpecialIconButton'>
                                <span style={{ height: '100%', width: '5px' }}><ChevronRightIcon size={16} /></span>
                                <span style={{ height: '100%' }} ><ChevronRightIcon size={16} /></span>
                            </Button>
                        </Tooltip>
                        <Button type='primary' className='messagesSpecialIconButton' style={{ padding: '0' }}>
                            <div style={{ height: '100%', background: 'linear-gradient(to right, white 0%, rgba(255,255,255,0) 50%, white 100%)', backgroundSize: '80%', backgroundRepeat: 'repeat', padding: '0 15px' }}>
                                <div style={{ width: '18px', height: '18px' }}>
                                    <SvgCircleStop style={{ verticalAlign: 'baseline', fill: 'hsl(0, 0%, 95%)' }} />
                                </div>
                            </div>
                        </Button>
                    </Input.Group>
                </div> */}

                {/* "Loading Messages  30/30" */}
                <AnimatePresence>
                    {api.MessageSearchPhase && (
                        <MotionSpan key='messageSearchPhase' overrideAnimProps={animProps_span_messagesStatus} style={{ marginBottom: '5px', alignSelf: 'flex-end', whiteSpace: 'nowrap', maxWidth: 'auto', textOverflow: 'elipsis' }}>
                            {api.MessageSearchPhase} <span style={{ fontWeight: 600 }}>{api.Messages?.length} / {uiState.topicSettings.searchParams.pageSize}</span>
                        </MotionSpan>
                    )}
                </AnimatePresence>

                {/* Quick Search */}
                <div style={{ marginTop: spaceStyle.marginTop, marginLeft: 'auto' }}>
                    <Input placeholder='Quick Search' allowClear={true} size='middle'
                        style={{ width: '200px', padding: '2px 8px', whiteSpace: 'nowrap' }}
                        value={uiState.topicSettings.quickSearch}
                        onChange={e => uiState.topicSettings.quickSearch = this.messageSource.filterText = e.target.value}
                        addonAfter={null} disabled={this.fetchError != null}
                    />
                </div>
            </div>

        </React.Fragment>
    });

    searchFunc = (source: 'auto' | 'manual') => {
        if (this.currentSearchRun)
            return console.log(`searchFunc: function already in progress (trigger:${source})`);

        const phase = untracked(() => api.MessageSearchPhase);
        if (phase)
            return console.log(`searchFunc: previous search still in progress (trigger:${source}, phase:${phase})`);

        try {
            const params = uiState.topicSettings.searchParams;
            // 1. trigger mobx: let it know we are interested in those props
            // 2. prevent recursive updates
            this.currentSearchRun = String(params._offsetMode) + params.pageSize + params.partitionID + params.sortOrder + params.sortType + params.startOffset;

            if (this.fetchError == null)
                this.executeMessageSearch();
        } catch (error) {
            console.error(error);
        } finally {
            this.currentSearchRun = null;
        }
    }

    isFilterMatch(str: string, m: TopicMessage) {
        str = str.toLowerCase();
        if (m.offset.toString().toLowerCase().includes(str)) return true;
        if (m.key && String(m.key).toLowerCase().includes(str)) return true;
        if (m.valueJson && m.valueJson.toLowerCase().includes(str)) return true;
        return false;
    }

    FilterSummary() {

        if (this && this.messageSource && this.messageSource.data) {
            // todo
        }
        else {
            return null;
        }

        const displayText = this.messageSource.data.length == api.Messages.length
            ? 'Filter matched all messages'
            : <><b>{this.messageSource.data.length}</b> results</>;

        return <div style={{ marginRight: '1em' }}>
            <MotionDiv identityKey={displayText}>
                <Text type='secondary'>{displayText}</Text>
            </MotionDiv>
        </div>
    }

    @computed
    get activeTags() {
        return uiState.topicSettings.previewTags.filter(t => t.active).map(t => t.value);
    }

    MessageTable = observer(() => {

        // debug...
        // let i = 0;
        // for (const x of this.messageSource.data) {
        //     let s = '';
        //     for (let j = 0; j < i; j++) s += simpleUniqueId(i.toString());
        //     x.key = s;
        //     i += 1;
        // }

        const previewButton = <>
            <span style={{ display: 'inline-flex', alignItems: 'center', height: 0, marginLeft: '4px' }}>
                <Button shape='round' className='hoverBorder' onClick={() => this.showPreviewSettings = true} style={{ color: '#1890ff', padding: '0 0.5em', background: 'transparent' }}>
                    <SettingOutlined style={{ fontSize: '1rem', transform: 'translateY(1px)' }} />
                    <span style={{ marginLeft: '.3em', fontSize: '85%' }}>Preview</span>
                    {(() => {
                        const count = uiState.topicSettings.previewTags.sum(t => t.active ? 1 : 0);
                        if (count > 0)
                            return <span style={{ marginLeft: '.3em' }}>(<b>{count} active</b>)</span>
                        return <></>;
                    })()}
                </Button>
            </span>
        </>

        const columns: ColumnProps<TopicMessage>[] = [
            { width: 1, title: 'Offset', dataIndex: 'offset', sorter: sortField('offset'), defaultSortOrder: 'descend', render: (t: number) => numberToThousandsString(t) },
            { width: 1, title: 'Partition', dataIndex: 'partitionID', sorter: sortField('partitionID'), },
            { width: 1, title: 'Timestamp', dataIndex: 'timestamp', sorter: sortField('timestamp'), render: (t: number) => new Date(t * 1000).toLocaleString() },
            { width: 3, title: 'Key', dataIndex: 'key', render: renderKey, sorter: this.keySorter },
            {
                width: 'auto',
                title: <span>Value {previewButton}</span>,
                dataIndex: 'value',
                render: (t, r) => <MessagePreview msg={r} previewFields={() => this.activeTags} />,
                //filteredValue: ['?'],
                //onFilter: (value, record) => { console.log(`Filtering value: ${value}`); return true; },
            },
            {
                width: 1, title: 'Size', dataIndex: 'size', render: (s) => { if (s > 1000) s = Math.round(s / 1000) * 1000; return prettyBytes(s) },
                sorter: (a, b) => b.size - a.size
            },
            {
                width: 1, title: ' ', key: 'action', className: 'msgTableActionColumn',
                render: (text, record) => !record.isValueNull && (
                    <span>
                        <ZeroSizeWrapper width={32} height={0}>
                            <Button className='iconButton' style={{ height: '40px', width: '40px' }} type='link' icon={<CopyOutlined />} size='middle' onClick={() => this.copyMessage(record)} />
                        </ZeroSizeWrapper>
                        {/* <ZeroSizeWrapper width={32} height={0}>
                                <Button className='iconButton fill' style={{ height: '40px', width: '40px' }} type='link' icon={<LinkOutlined />} size='middle' onClick={() => this.copyLinkToMessage(record)} />
                            </ZeroSizeWrapper> */}
                        {/* <Divider type="vertical" /> */}
                    </span>
                ),
            },
        ];

        return <>
            <ConfigProvider renderEmpty={this.empty}>
                <Table
                    style={{ margin: '0', padding: '0', whiteSpace: 'nowrap' }}
                    size='middle'
                    showSorterTooltip={false}
                    pagination={this.pageConfig}
                    onChange={(pagination) => {
                        if (pagination.pageSize) uiState.topicSettings.messagesPageSize = pagination.pageSize;
                        this.pageConfig.current = pagination.current;
                        this.pageConfig.pageSize = pagination.pageSize;
                    }}

                    dataSource={this.messageSource.data}

                    loading={this.requestInProgress}
                    rowKey={r => r.offset + ' ' + r.partitionID + r.timestamp}
                    rowClassName={(r: TopicMessage) => (r.isValueNull) ? 'tombstone' : ''}

                    expandable={{
                        expandRowByClick: false,
                        expandedRowRender: record => RenderExpandedMessage(record),
                        expandIconColumnIndex: columns.findIndex(c => c.dataIndex === 'value')
                    }}

                    columns={columns}
                />

                {
                    (this.messageSource?.data?.length > 0) &&
                    <PreviewSettings allCurrentKeys={this.allCurrentKeys} getShowDialog={() => this.showPreviewSettings} setShowDialog={s => this.showPreviewSettings = s} />
                }

            </ConfigProvider>
        </>
    })

    keySorter(a: TopicMessage, b: TopicMessage, sortOrder?: SortOrder): number {
        const ta = String(a.key) ?? "";
        const tb = String(b.key) ?? "";
        return ta.localeCompare(tb);
    }

    copyMessage(record: TopicMessage) {
        navigator.clipboard.writeText(record.valueJson);
        message.success('Message content (JSON) copied to clipboard', 5);
    }

    copyLinkToMessage(record: TopicMessage) {
        const searchParams = { o: record.offset, p: record.partitionID, s: 1 };
        const query = queryString.stringify(searchParams);
        const url = parseUrl(window.location.href);
        url.search = query;

        const newUrl = formatUrl(url);
        console.log("copied url: " + newUrl);

        //navigator.clipboard.writeText(record.valueJson);
        //message.success('Message content (JSON) copied to clipboard', 5);
    }

    async executeMessageSearch(): Promise<void> {
        const searchParams = uiState.topicSettings.searchParams;

        if (searchParams._offsetMode != TopicMessageOffset.Custom)
            searchParams.startOffset = searchParams._offsetMode;

        editQuery(query => {
            query["p"] = String(searchParams.partitionID); // p = partition
            query["s"] = String(searchParams.pageSize); // s = size
            query["o"] = String(searchParams.startOffset); // o = offset
        })

        transaction(async () => {
            try {
                this.fetchError = null;
                this.requestInProgress = true;

                api.startMessageSearch(this.props.topic.topicName, searchParams);

                // await api.searchTopicMessages(this.props.topic.topicName, searchParams);
                // this.allCurrentKeys = Array.from(getAllKeys(api.Messages.map(m => m.value))); // cache array of every single key
                // this.pageConfig.current = undefined;
            } catch (error) {
                console.error('error in searchTopicMessages: ' + error.toString());
                this.fetchError = error;
            } finally {
                this.requestInProgress = false;
            }
        });

    }

    /*
        SearchQueryAdditionalInfo = observer(() => {
            if (!api.MessageResponse) return null;
            if (api.MessageResponse.fetchedMessages === undefined) return null;
            const formatTime = (ms: number) => !!ms && ms > 0
                ? prettyMilliseconds(api.MessageResponse.elapsedMs, { secondsDecimalDigits: 2 })
                : "undefined";

            const warningDisplay = () => <>
                <Icon type="warning" theme="twoTone" twoToneColor="orange" style={{ fontSize: '150%', marginRight: '0.2em' }} />
                <Text type='warning' strong>
                    Backend aborted the search after <b>{formatTime(api.MessageResponse.elapsedMs)}</b> (fetched {api.MessageResponse.fetchedMessages} messages)
                </Text>
            </>

            const typeTags = api.MessageResponse.messages.map(m => m.valueType).distinct().map(t => this.formatTypeToTag(t)).filter(t => t != null);

            const normalDisplay = () => <>
                <Text type='secondary'>
                    <b>{api.MessageResponse.fetchedMessages}</b> messages (in <b>{formatTime(api.MessageResponse.elapsedMs)}</b>)
                </Text>
                <Divider type='vertical' />
                {typeTags}
            </>

            return <MotionAlways>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                    <Divider type='vertical' />
                    {api.MessageResponse.isCancelled === true ? warningDisplay() : normalDisplay()}
                </span>
            </MotionAlways>
        })
    */

    formatTypeToTag(type: string) {
        type = String(type);
        switch (type) {
            case 'json': return <Tag key={1} color='orange'>JSON</Tag>
            case 'xml': return <Tag key={2} color='green'>XML</Tag>
            case 'avro': return <Tag key={3} color='blue'>Avro</Tag>
            case 'binary': return <Tag key={4} color='red'>Binary</Tag>
            case 'text': return <Tag key={5} color='gold'>Text</Tag>
            case '': return null;
        }
        return <Tag key={6} color='black'>Unknown: {type}</Tag>
    }

    empty = () => <Empty description={<>
        <Text type='secondary' strong style={{ fontSize: '125%' }}>No messages</Text>
        <br />
        <span>Either the selected topic/partition did not contain any messages</span>
    </>} />
}

const renderKey = (key: any | null | undefined) => {
    const text = typeof key === 'string' ? key : ToJson(key);

    if (key == undefined || key == null || text.length == 0 || text == '{}')
        return <span style={{ opacity: 0.66, marginLeft: '2px' }}><Octicon icon={Skip} /></span>

    if (text.length > 45) {

        const modal = () => Modal.info({
            title: 'Key',
            width: '80vw',
            centered: true,
            maskClosable: true,
            content: (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div>
                        Full view of the key<br />
                        <b>todo: add different viewers here (plain, hex, ...)</b><br />
                        <b>todo: fix layout</b><br />
                    </div>
                    <div className='codeBox' style={{ margin: '1em 0 0 0', padding: '1em', whiteSpace: 'normal', wordBreak: 'break-all', overflowY: 'scroll', maxHeight: '300px' }}>
                        <code>{text}</code>
                    </div>
                </div>
            ),
            onOk() { },
        });

        return <span className='hoverLink cellDiv' style={{ minWidth: '120px' }} onClick={() => modal()}>
            <code style={{ fontSize: '95%' }}>{text.slice(0, 44)}&hellip;</code>
        </span>
    }

    return <span className='cellDiv' style={{ width: 'auto' }}>
        <code style={{ fontSize: '95%' }}>{text}</code>
    </span>;
};


@observer
class MessagePreview extends Component<{ msg: TopicMessage, previewFields: () => string[] }> {
    render() {
        const msg = this.props.msg;
        const value = msg.value;
        const fields = this.props.previewFields();

        try {
            let text: ReactNode = <></>;

            if (!value || msg.isValueNull) {
                // null: must be a tombstone (maybe? what if other fields are not null?)
                // todo: render tombstones in a better way!
                text = <><DeleteOutlined style={{ fontSize: 16, color: 'rgba(0,0,0, 0.35)', verticalAlign: 'text-bottom', marginRight: '4px', marginLeft: '1px' }} /><code>Tombstone</code></>
            }
            else if (msg.valueType == 'text') {
                // Raw Text (wtf :P)
                text = value;
            }
            else if (msg.valueType == 'binary') {
                // Binary data is displayed as hex dump
                text = msg.valueBinHexPreview;
            }
            else if (fields.length > 0) {
                // Json!
                // Construct our preview object
                const previewObj: any = {};
                const searchOptions = { caseSensitive: uiState.topicSettings.previewTagsCaseSensitive, returnFirstResult: uiState.topicSettings.previewMultiResultMode == 'showOnlyFirst' };
                for (let f of fields) {
                    const results = findElementDeep(value, f, searchOptions);

                    if (results.length > 0) {
                        const propName = (!searchOptions.returnFirstResult && uiState.topicSettings.previewShowResultCount)
                            ? `${results[0].propertyName}(${results.length})`
                            : results[0].propertyName;

                        if (results.length == 1 || searchOptions.returnFirstResult)
                            previewObj[propName] = results[0].value; // show only first value
                        else
                            previewObj[propName] = results.map(r => r.value); // show array of all found values
                    }
                }

                // text = cullText(JSON.stringify(value), 100);
                // text = JSON.stringify(previewObj, undefined, 2)
                text = JSON.stringify(previewObj, undefined, 4).removePrefix('{').removeSuffix('}').trim();
            }
            else {
                // Normal display (json, no filters). Just stringify the whole object
                text = cullText(JSON.stringify(value), 100);
            }

            return <code><span className='cellDiv' style={{ fontSize: '95%' }}>{text}</span></code>
        }
        catch (e) {
            return <span style={{ color: 'red' }}>Error in RenderPreview: {e.toString()}</span>
        }
    }
}


function RenderExpandedMessage(msg: TopicMessage, shouldExpand?: ((x: CollapsedFieldProps) => boolean)) {
    try {
        if (!msg || !msg.value) return <code>null</code>
        const shouldCollapse = shouldExpand ? shouldExpand : false;

        if (msg.valueType == 'binary') {
            const mode = 'ascii' as ('ascii' | 'raw' | 'hex');
            if (mode == 'raw') {
                return <code style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}>{msg.value}</code>
            }
            else if (mode == 'hex') {
                const str = msg.value as string;
                var hex = '';
                for (var i = 0; i < str.length; i++) {
                    let n = str.charCodeAt(i).toString(16);
                    if (n.length == 1) n = '0' + n;
                    hex += n + ' ';
                }

                return <code style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}>{hex}</code>
            }
            else {
                const str = msg.value as string;
                var result = '';
                const isPrintable = /[\x20-\x7E]/;
                for (var i = 0; i < str.length; i++) {
                    let ch = String.fromCharCode(str.charCodeAt(i)); // str.charAt(i);
                    ch = isPrintable.test(ch) ? ch : '. ';
                    result += ch + ' ';
                }

                return <code style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}>{result}</code>
            }
        }

        return (
            <>
                {/* <Affix offsetTop={30}>
                    <Button icon='copy' shape='circle' size='large'
                        style={{ float: 'right', margin: '1em', zIndex: 10 }} />
                </Affix> */}

                <ReactJson
                    style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}
                    displayDataTypes={false} displayObjectSize={true} enableClipboard={false}
                    src={msg.value}
                    name={null}
                    collapseStringsAfterLength={40}
                    groupArraysAfterLength={100}
                    indentWidth={5}
                    iconStyle='triangle'
                    collapsed={2}
                    shouldCollapse={shouldCollapse}
                />
            </>
        )
    }
    catch (e) {
        return <span style={{ color: 'red' }}>Error in RenderExpandedMessage: {e.toString()}</span>
    }
}

@observer
class PreviewSettings extends Component<{ allCurrentKeys: string[], getShowDialog: () => boolean, setShowDialog: (show: boolean) => void }> {
    render() {

        const content = <>
            <Paragraph>
                <Text>
                    When viewing large messages we're often only interested in a few specific fields.
                            To make the preview more helpful, add all the json keys you want to see.<br />
                            Click on an existing tag to toggle it on/off, or <b>x</b> to remove it.<br />
                </Text>
            </Paragraph>
            <div style={{ padding: '1.5em 1em', background: 'rgba(200, 205, 210, 0.16)', borderRadius: '4px' }}>
                <CustomTagList tags={uiState.topicSettings.previewTags} allCurrentKeys={this.props.allCurrentKeys} />
            </div>
            <div style={{ marginTop: '1em' }}>
                <h3 style={{ marginBottom: '0.5em' }}>Settings</h3>
                <Space size='large'>
                    <OptionGroup label='Matching' options={{ 'Ignore Case': false, 'Case Sensitive': true }}
                        value={uiState.topicSettings.previewTagsCaseSensitive}
                        onChange={e => uiState.topicSettings.previewTagsCaseSensitive = e}
                    />
                    <OptionGroup label='Multiple Results' options={{ 'First result': 'showOnlyFirst', 'Show All': 'showAll' }}
                        value={uiState.topicSettings.previewMultiResultMode}
                        onChange={e => uiState.topicSettings.previewMultiResultMode = e}
                    />
                    {uiState.topicSettings.previewMultiResultMode == 'showAll' &&
                        <OptionGroup label='Result Count' options={{ 'Hide': false, 'As part of name': true }}
                            value={uiState.topicSettings.previewShowResultCount}
                            onChange={e => uiState.topicSettings.previewShowResultCount = e}
                        />
                    }
                </Space>
                {
                    // - Show Empty Messages: when unchecked, and the field-filters don't find anything, the whole message will be hidden instead of showing an empty "{}"
                    // - JS filters! You get a small textbox where you can type in something like those examples:
                    //     Example 1 | // if the name matches, show this prop in the preview
                    //               | if (prop.key == 'name') show(prop)

                    // - JS filters could also be submitted to the backend, so it can do the filtering there already
                }
                {
                    // <Checkbox
                    //     checked={uiSettings.topicList.previewShowEmptyMessages}
                    //     onChange={e => uiSettings.topicList.previewShowEmptyMessages = e.target.checked}
                    // >Show Empty Messages</Checkbox>
                }
            </div>
        </>

        return <Modal
            title={<span><FilterOutlined style={{ fontSize: '22px', verticalAlign: 'bottom', marginRight: '16px', color: 'hsla(209, 20%, 35%, 1)' }} />Preview Fields</span>}
            visible={this.props.getShowDialog()}
            onOk={() => this.props.setShowDialog(false)}
            onCancel={() => this.props.setShowDialog(false)}
            width={750}
            okText='Close'
            cancelButtonProps={{ style: { display: 'none' } }}
            closable={false}
            maskClosable={true}
        >
            {content}
        </Modal>;
    }
}


@observer
class CustomTagList extends Component<{ tags: PreviewTag[], allCurrentKeys: string[] }> {
    @observable inputVisible = false;
    @observable inputValue = '';

    @observable activeTags: string[] = [];

    render() {

        const tagSuggestions = this.props.allCurrentKeys.filter(k => this.props.tags.all(t => t.value != k));

        return <>
            <AnimatePresence>
                <MotionDiv positionTransition>

                    {this.props.tags.map(v => <CustomTag key={v.value} tag={v} tagList={this} />)}

                    {this.inputVisible &&
                        <motion.span positionTransition>
                            {/* <Input
                                ref={r => { if (r) { r.focus(); } }}
                                type="text"
                                size="small"
                                style={{ width: 78 }}
                                value={this.inputValue}
                                onChange={e => this.inputValue = e.target.value}
                                onBlur={this.handleInputConfirm}
                                onPressEnter={this.handleInputConfirm}
                            /> */}
                            <span onKeyDown={e => {
                                if (e.key == 'Enter') this.handleInputConfirm();
                                if (e.key == 'Escape') { this.inputValue = ''; this.handleInputConfirm(); }
                            }}>
                                <AutoComplete
                                    ref={r => { if (r) { r.focus(); } }}

                                    dataSource={tagSuggestions}

                                    size="small"
                                    style={{ width: 130 }}
                                    value={this.inputValue}
                                    onChange={e => this.inputValue = e.toString()}
                                    onBlur={() => { this.handleInputConfirm(); }}
                                    filterOption={true}
                                />
                            </span>

                        </motion.span>
                    }

                    {!this.inputVisible &&
                        <motion.span positionTransition>
                            <Button onClick={() => this.inputVisible = true} size='small' type='dashed'>
                                <PlusOutlined style={{ color: '#999' }} />
                                <>Add Preview</>
                            </Button>
                        </motion.span>
                    }

                    <br />

                    {/* <Select<string> mode='tags'
                        style={{ minWidth: '26em' }} size='large'
                        placeholder='Enter properties for preview'
                    >
                        {tagSuggestions.map(k =>
                            <Select.Option key={k} value={k}>{k}</Select.Option>
                        )}
                    </Select> */}

                </MotionDiv>
            </AnimatePresence>
        </>
    }

    handleInputConfirm = () => {
        const tags = this.props.tags;
        const newTag = this.inputValue;
        if (newTag && tags.all(t => t.value != newTag)) {
            tags.push({ value: newTag, active: true });
        }
        this.inputVisible = false;
        this.inputValue = '';
    };

    get tags(): PreviewTag[] { return this.props.tags; }
    get tagNames(): string[] { return this.props.tags.map(t => t.value); }
    get activeTagNames(): string[] { return this.props.tags.filter(t => t.active).map(t => t.value); }

    setTagActive(tag: string, isActive: boolean) {
        if (!isActive) {
            this.activeTags.remove(tag);
        } else {
            this.activeTags.push(tag);
        }
    }

    removeTag(tag: string) {
        this.props.tags.removeAll(t => t.value === tag);
    }
}

@observer
class CustomTag extends Component<{ tag: PreviewTag, tagList: CustomTagList }> {
    @observable isActive = false;

    render() {
        const tag = this.props.tag;
        const list = this.props.tagList;
        const value = tag.value;

        return <motion.span>
            <Tag
                color={tag.active ? 'blue' : undefined}
                key={value}
                onClick={() => tag.active = !tag.active}
                closable
                onClose={() => list.removeTag(value)}
            >{value}</Tag>
        </motion.span>
    }
}
