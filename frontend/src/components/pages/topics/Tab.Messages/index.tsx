import { ClockCircleOutlined, DeleteOutlined, DownloadOutlined, EllipsisOutlined, FilterOutlined, PlusOutlined, QuestionCircleTwoTone, SettingFilled, SettingOutlined } from '@ant-design/icons';
import { PlusIcon, SkipIcon, SyncIcon, XCircleIcon } from '@primer/octicons-v2-react';
import { Alert, AutoComplete, Button, ConfigProvider, Dropdown, Empty, Input, Menu, message, Modal, Popover, Row, Select, Space, Switch, Table, Tag, Tooltip, Typography } from "antd";
import { ColumnProps } from "antd/lib/table";
import { SortOrder } from "antd/lib/table/interface";
import Paragraph from "antd/lib/typography/Paragraph";
import { AnimatePresence, motion } from "framer-motion";
import { autorun, computed, IReactionDisposer, observable, transaction, untracked } from "mobx";
import { observer } from "mobx-react";
import prettyBytes from 'pretty-bytes';
import prettyMilliseconds from "pretty-ms";
import Prism, { languages as PrismLanguages } from "prismjs";
import 'prismjs/components/prism-javascript';
import "prismjs/components/prism-js-extras";
import 'prismjs/prism.js';
import 'prismjs/themes/prism.css';
import queryString from 'query-string';
import React, { Component, ReactNode } from "react";
import { CollapsedFieldProps } from 'react-json-view';
import Editor from 'react-simple-code-editor';
import { format as formatUrl, parse as parseUrl } from "url";
import { api } from "../../../../state/backendApi";
import { TopicDetail, TopicMessage } from "../../../../state/restInterfaces";
import { ColumnList, FilterEntry, PreviewTag, TopicOffsetOrigin } from "../../../../state/ui";
import { uiState } from "../../../../state/uiState";
import { animProps_span_messagesStatus, MotionDiv, MotionSpan } from "../../../../utils/animationProps";
import '../../../../utils/arrayExtensions';
import { IsDev } from "../../../../utils/env";
import { isClipboardAvailable } from "../../../../utils/featureDetection";
import { FilterableDataSource } from "../../../../utils/filterableDataSource";
import { sanitizeString, wrapFilterFragment } from "../../../../utils/filterHelper";
import { editQuery } from "../../../../utils/queryHelper";
import { Label, LayoutBypass, numberToThousandsString, OptionGroup, QuickTable, StatusIndicator, TimestampDisplay } from "../../../../utils/tsxUtils";
import { cullText, findElementDeep, ToJson } from "../../../../utils/utils";
import { makePaginationConfig, range, sortField } from "../../../misc/common";
import { KowlJsonView } from "../../../misc/KowlJsonView";
import { NoClipboardPopover } from "../../../misc/NoClipboardPopover";
import styles from './styles.module.scss';
import filterExample1 from '../../../../assets/filter-example-1.png';
import filterExample2 from '../../../../assets/filter-example-2.png';

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

    @observable previewDisplay: string[] = [];
    @observable allCurrentKeys: string[] = [];
    @observable showPreviewSettings = false;
    @observable showColumnSettings = false;

    @observable fetchError = null as Error | null;

    pageConfig = makePaginationConfig(uiState.topicSettings.messagesPageSize);
    messageSource = new FilterableDataSource<TopicMessage>(() => api.messages, this.isFilterMatch, 16);

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
        const query = queryString.parse(window.location.search);
        console.log("parsing query: " + ToJson(query));
        if (query.p != null) searchParams.partitionID = Number(query.p);
        if (query.s != null) searchParams.maxResults = Number(query.s);
        if (query.o != null) {
            searchParams.startOffset = Number(query.o);
            searchParams.offsetOrigin = (searchParams.startOffset >= 0) ? TopicOffsetOrigin.Custom : searchParams.startOffset;
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

        /*
        message.config({ top: 8 });
        const content = <div>
            <div style={{ minWidth: '300px', lineHeight: 0 }}>
                <Progress percent={80} showInfo={false} status='active' size='small' style={{ lineHeight: 1 }} />
            </div>
            <div style={{ display: 'flex', fontFamily: '"Open Sans", sans-serif', fontWeight: 600, fontSize: '80%' }}>
                <div>Status</div>
                <div style={{ marginLeft: 'auto', paddingLeft: '2em' }}>76/200</div>
            </div>
        </div>
        const hide = message.open({ content: content, key: 'messageSearchStatus', icon: <span />, duration: null, type: 'loading' });
        */
        //setTimeout(hide, 2000);

        // const searchProgressIndicatorReaction = autorun(() => {
        // });

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
        const canUseFilters = api.topicPermissions.get(topic.topicName)?.canUseSearchFilters ?? true;

        return <React.Fragment>
            <div style={{ margin: '0 1px', marginBottom: '12px', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {/* Search Settings*/}
                <Label text='Partition' style={{ ...spaceStyle }}>
                    <Select<number> value={searchParams.partitionID} onChange={c => searchParams.partitionID = c} style={{ width: '9em' }} size='middle'>
                        <Select.Option key='all' value={-1}>All</Select.Option>
                        {range(0, topic.partitionCount).map(i =>
                            <Select.Option key={i} value={i}>Partition {i.toString()}</Select.Option>)}
                    </Select>
                </Label>
                <Label text='Start Offset' style={{ ...spaceStyle }}>
                    <InputGroup compact style={{ display: 'inline-block', width: 'auto' }}>
                        <Select<TopicOffsetOrigin> value={searchParams.offsetOrigin} onChange={e => searchParams.offsetOrigin = e} size='middle'
                            dropdownMatchSelectWidth={false} style={{ width: '9em' }}
                        >
                            {/* riki's solution: */}
                            { /* First */}
                            { /* Last */}
                            { /* Next */}
                            { /* Custom */}
                            {/* weeco's solution: https://i.imgur.com/mhbgyPS.png */}
                            <Option value={TopicOffsetOrigin.End}>Newest</Option>
                            <Option value={TopicOffsetOrigin.EndMinusResults}>Newest<span style={{ opacity: '90%' }}>-{searchParams.maxResults}</span></Option>
                            <Option value={TopicOffsetOrigin.Start}>Oldest</Option>
                            <Option value={TopicOffsetOrigin.Custom}>Custom</Option>
                        </Select>
                        {
                            searchParams.offsetOrigin == TopicOffsetOrigin.Custom &&
                            <Input style={{ width: '7.5em' }} maxLength={20}
                                value={searchParams.startOffset} onChange={e => searchParams.startOffset = +e.target.value}
                                disabled={searchParams.offsetOrigin != TopicOffsetOrigin.Custom} />
                        }
                    </InputGroup>
                </Label>
                <Label text='Max Results' style={{ ...spaceStyle }}>
                    <Select<number> value={searchParams.maxResults} onChange={c => searchParams.maxResults = c} style={{ width: '9em' }} size='middle'>
                        {[1, 3, 5, 10, 20, 50, 100, 200, 500].map(i => <Select.Option key={i} value={i}>{i.toString()}</Select.Option>)}
                    </Select>
                </Label>
                <Label text='Filter' style={{ ...spaceStyle }}>
                    <div style={{ height: '32px', paddingTop: '4px' }}>
                        <Tooltip title="You don't have permissions to use search filters in this topic" trigger={canUseFilters ? 'none' : 'hover'}>
                            <Switch checked={searchParams.filtersEnabled && canUseFilters} onChange={v => searchParams.filtersEnabled = v} disabled={!canUseFilters} />
                        </Tooltip>
                    </div>
                </Label>

                {/* Refresh Button */}
                <Label text='' style={{ ...spaceStyle }}>
                    <div style={{ display: 'flex' }}>

                        <AnimatePresence>
                            {api.messageSearchPhase == null &&
                                <MotionSpan identityKey='btnRefresh' overrideAnimProps={animProps_span_messagesStatus}>
                                    <Tooltip title='Repeat current search'>
                                        <Button type='primary' onClick={() => this.searchFunc('manual')}>
                                            <SyncIcon size={16} />
                                        </Button>
                                    </Tooltip>
                                </MotionSpan>
                            }
                            {api.messageSearchPhase != null &&
                                <MotionSpan identityKey='btnCancelSearch' overrideAnimProps={animProps_span_messagesStatus}>
                                    <Tooltip title='Stop searching'>
                                        <Button type='primary' danger onClick={() => api.stopMessageSearch()} style={{ padding: 0, width: '48px' }}>
                                            <LayoutBypass >
                                                <XCircleIcon size={20} />
                                            </LayoutBypass>
                                        </Button>
                                    </Tooltip>
                                </MotionSpan>
                            }
                        </AnimatePresence>
                    </div>
                </Label>

                {/* Quick Search */}
                <div style={{ marginTop: spaceStyle.marginTop, marginLeft: 'auto' }}>
                    <Input placeholder='Quick Search' allowClear={true} size='middle'
                        style={{ width: '200px', padding: '2px 8px', whiteSpace: 'nowrap' }}
                        value={uiState.topicSettings.quickSearch}
                        onChange={e => uiState.topicSettings.quickSearch = this.messageSource.filterText = e.target.value}
                        addonAfter={null} disabled={this.fetchError != null}
                    />
                </div>

                {/* Search Progress Indicator: "Consuming Messages 30/30" */}
                {
                    Boolean(api.messageSearchPhase && api.messageSearchPhase.length > 0) &&
                    <StatusIndicator
                        identityKey='messageSearch'
                        fillFactor={(api.messages?.length ?? 0) / searchParams.maxResults}
                        statusText={api.messageSearchPhase!}
                        progressText={`${api.messages?.length ?? 0} / ${searchParams.maxResults}`}
                        bytesConsumed={searchParams.filtersEnabled ? prettyBytes(api.messagesBytesConsumed) : undefined}
                        messagesConsumed={searchParams.filtersEnabled ? String(api.messagesTotalConsumed) : undefined}
                    />

                }

                {/*
                api.MessageSearchPhase && api.MessageSearchPhase.length > 0 && searchParams.filters.length>0 &&
                    <StatusIndicator
                        identityKey='messageSearch'
                        fillFactor={(api.Messages?.length ?? 0) / searchParams.maxResults}
                        statusText={api.MessageSearchPhase}
                        progressText={`${api.Messages?.length ?? 0} / ${searchParams.maxResults}`}
                        bytesConsumed={searchParams.filtersEnabled ? prettyBytes(api.MessagesBytesConsumed) : undefined}
                        messagesConsumed={searchParams.filtersEnabled ? String(api.MessagesTotalConsumed) : undefined}
                    />
                    */
                }

                {/* Filter Tags */}
                {searchParams.filtersEnabled && <div style={{ paddingTop: '1em', width: '100%' }}>
                    <MessageSearchFilterBar />
                </div>}



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
            </div>

        </React.Fragment>
    });

    searchFunc = (source: 'auto' | 'manual') => {

        // need to do this first, so we trigger mobx
        const params = uiState.topicSettings.searchParams;
        const searchParams = String(params.offsetOrigin) + params.maxResults + params.partitionID + params.startOffset;

        if (this.currentSearchRun)
            return console.log(`searchFunc: function already in progress (trigger:${source})`);

        const phase = untracked(() => api.messageSearchPhase);
        if (phase)
            return console.log(`searchFunc: previous search still in progress (trigger:${source}, phase:${phase})`);

        try {
            this.currentSearchRun = searchParams;

            if (this.fetchError == null)
                untracked(() => this.executeMessageSearch());
        } catch (error) {
            console.error(error);
        } finally {
            this.currentSearchRun = null;
        }
    }

    cancelSearch = () => api.stopMessageSearch();

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

        const displayText = this.messageSource.data.length == api.messages.length
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

        const copyDropdown = (record: TopicMessage) => (
            <Menu>
                <Menu.Item key="0" onClick={() => this.copyMessage(record, 'key')}>
                    Copy Key
                </Menu.Item>

                <Menu.Item key="1" onClick={() => this.copyMessage(record, 'rawValue')}>
                    Copy Value (Raw)
                </Menu.Item>
                <Menu.Item key="2" onClick={() => this.copyMessage(record, 'jsonValue')}>
                    Copy Value (JSON Format)
                </Menu.Item>
                <Menu.Item key="4" onClick={() => this.copyMessage(record, 'timestamp')}>
                    Copy Epoch Timestamp
                </Menu.Item>
            </Menu>
        );

        const tsFormat = uiState.topicSettings.previewTimestamps;
        const IsColumnSettingsEnabled = uiState.topicSettings.previewColumnFields.length || uiState.topicSettings.previewTimestamps !== 'default';
        const columns: ColumnProps<TopicMessage>[] = [
            { width: 1, title: 'Offset', dataIndex: 'offset', sorter: sortField('offset'), defaultSortOrder: 'descend', render: (t: number) => numberToThousandsString(t) },
            { width: 1, title: 'Partition', dataIndex: 'partitionID', sorter: sortField('partitionID'), },
            { width: 1, title: 'Timestamp', dataIndex: 'timestamp', sorter: sortField('timestamp'), render: (t: number) => <TimestampDisplay unixEpochSecond={t} format={tsFormat} /> },
            { width: 2, title: 'Key', dataIndex: 'key', render: renderKey, sorter: this.keySorter },
            {
                width: 'auto',
                title: <span>Value {previewButton}</span>,
                dataIndex: 'value',
                render: (t, r) => <MessagePreview msg={r} previewFields={() => this.activeTags} />,
                //filteredValue: ['?'],
                //onFilter: (value, record) => { console.log(`Filtering value: ${value}`); return true; },
            },
            // {
            //     width: 1, title: 'Headers', dataIndex: 'headers', sorter: (a, b, order) => b.headers.length - a.headers.length, render: (t, r) => r.headers.length,
            // },
            {
                width: 1, title: 'Size', dataIndex: 'size', render: (s) => { if (s > 1000) s = Math.round(s / 1000) * 1000; return prettyBytes(s) },
                sorter: (a, b) => b.size - a.size
            },
            {
                width: 1, title: ' ', key: 'action', className: 'msgTableActionColumn',
                filters: [],
                filterDropdownVisible: false,
                onFilterDropdownVisibleChange: (_) => this.showColumnSettings = true,
                filterIcon: (_) => {
                    return <Tooltip title='Column Settings' mouseEnterDelay={0.1}>
                        <SettingFilled style={IsColumnSettingsEnabled ? { color: '#1890ff' } : { color: '#a092a0' }} />
                    </Tooltip>
                },
                render: (text, record) => !record.isValueNull && (
                    <NoClipboardPopover placement='left'>
                        <div> {/* the additional div is necessary because popovers do not trigger on disabled elements, even on hover */}
                            <Dropdown disabled={!isClipboardAvailable} overlayClassName='disableAnimation' overlay={copyDropdown(record)} trigger={['click']}>
                                <Button className='iconButton' style={{ height: '100%', width: '100%', verticalAlign: 'middle', pointerEvents: isClipboardAvailable ? 'auto' : 'none' }} type='link'
                                    icon={<EllipsisOutlined style={{ fontSize: '32px', display: 'flex', alignContent: 'center', justifyContent: 'center' }} />} size='middle' />
                            </Dropdown>
                        </div>
                    </NoClipboardPopover>
                    // <ZeroSizeWrapper width={32} height={0}>
                    //     <Button className='iconButton' style={{ height: '40px', width: '40px' }} type='link' icon={<CopyOutlined />} size='middle' onClick={() => this.copyMessage(record)} />
                    // </ZeroSizeWrapper>
                    // <ZeroSizeWrapper width={32} height={0}>
                    //     <Button className='iconButton fill' style={{ height: '40px', width: '40px' }} type='link' icon={<LinkOutlined />} size='middle' onClick={() => this.copyLinkToMessage(record)} />
                    // </ZeroSizeWrapper>
                    // <Divider type="vertical" />
                ),
            },
        ];

        // If the previewColumnFields is empty then use the default columns, otherwise filter it based on it
        const filteredColumns: (ColumnProps<TopicMessage>)[] =
            uiState.topicSettings.previewColumnFields.length == 0
                ? columns
                : uiState.topicSettings.previewColumnFields
                    .map(columnList =>
                        columns.find(c => c.dataIndex === columnList.dataIndex)
                    )
                    .filter(column => !!column)
                    // Add the action tab at the end
                    .concat(columns[columns.length - 1]) as (ColumnProps<TopicMessage>)[];

        // remove headers column if no message has headers
        // const hasHeaders = this.messageSource.data.any(m => m.headers.length > 0);
        // if (!hasHeaders) filteredColumns.removeAll(c => c.dataIndex == 'headers');


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

                    rowKey={r => r.offset + ' ' + r.partitionID + r.timestamp}
                    rowClassName={(r: TopicMessage) => (r.isValueNull) ? 'tombstone' : ''}

                    expandable={{
                        expandRowByClick: false,
                        expandIconColumnIndex: filteredColumns.findIndex(c => c.dataIndex === 'value'),
                        rowExpandable: _ => filteredColumns.findIndex(c => c.dataIndex === 'value') === -1 ? false : true,
                        expandedRowRender: record => RenderExpandedMessage(record),
                    }}

                    columns={filteredColumns}
                />

                {
                    (this.messageSource?.data?.length > 0) &&
                    <PreviewSettings allCurrentKeys={this.allCurrentKeys} getShowDialog={() => this.showPreviewSettings} setShowDialog={s => this.showPreviewSettings = s} />
                }

                <ColumnSettings allCurrentKeys={this.allCurrentKeys} getShowDialog={() => this.showColumnSettings} setShowDialog={s => this.showColumnSettings = s} />


            </ConfigProvider>
        </>
    })

    keySorter(a: TopicMessage, b: TopicMessage, sortOrder?: SortOrder): number {
        const ta = String(a.key) ?? "";
        const tb = String(b.key) ?? "";
        return ta.localeCompare(tb);
    }

    copyMessage(record: TopicMessage, field: "key" | "rawValue" | "jsonValue" | "timestamp") {

        switch (field) {
            case "key":
                typeof record.key === "string" ?
                    navigator.clipboard.writeText(record.key as string) :
                    navigator.clipboard.writeText(JSON.stringify(record.key));
                message.success('Key copied to clipboard', 5);
                break;
            case "rawValue":
                navigator.clipboard.writeText(record.valueJson);
                message.success('Raw Value copied to clipboard', 5);
                break;
            case "jsonValue":
                navigator.clipboard.writeText(JSON.stringify(record.value, null, 4));
                message.success('Message Value (JSON) copied to clipboard', 5);
                break;
            case "timestamp":
                navigator.clipboard.writeText(record.timestamp.toString());
                message.success('Epoch Timestamp copied to clipboard', 5);
                break;
            default:
            // empty
        }
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
        const canUseFilters = api.topicPermissions.get(this.props.topic.topicName)?.canUseSearchFilters ?? true;

        if (searchParams.offsetOrigin != TopicOffsetOrigin.Custom)
            searchParams.startOffset = searchParams.offsetOrigin;

        editQuery(query => {
            query["p"] = String(searchParams.partitionID); // p = partition
            query["s"] = String(searchParams.maxResults); // s = size
            query["o"] = String(searchParams.startOffset); // o = offset
        })

        let filterCode: string = "";
        if (searchParams.filtersEnabled && canUseFilters) {
            const functionNames: string[] = [];
            const functions: string[] = [];

            searchParams.filters.filter(e => e.isActive && e.code).forEach(e => {
                const name = `filter${functionNames.length + 1}`;
                functionNames.push(name);
                functions.push(`
function ${name}() {
    ${wrapFilterFragment(e.code)}
}`);
            });

            if (functions.length > 0) {
                filterCode = functions.join('\n\n') + "\n\n"
                    + `return ${functionNames.map(f => f + "()").join(' && ')}`;
                if (IsDev) console.log(`constructed filter code (${functions.length} functions)`, "\n\n" + filterCode);
            }
        }

        const request = {
            topicName: this.props.topic.topicName,
            partitionId: searchParams.partitionID,
            startOffset: searchParams.startOffset,
            maxResults: searchParams.maxResults,
            filterInterpreterCode: btoa(sanitizeString(filterCode)),
        };

        transaction(async () => {
            try {
                this.fetchError = null;
                api.startMessageSearch(request);
            } catch (error) {
                console.error('error in searchTopicMessages: ' + error.toString());
                this.fetchError = error;
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

const renderKey = (value: any, record: TopicMessage) => {
    const text = typeof value === 'string' ? value : ToJson(value);

    if (value == undefined || value == null || text.length == 0 || text == '{}')
        return <Tooltip title="Empty Key" mouseEnterDelay={0.1}>
            <span style={{ opacity: 0.66, marginLeft: '2px' }}><SkipIcon /></span>
        </Tooltip>

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
                // null: tombstone
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
    return <div>
        {(msg.headers.length > 0) && RenderMessageHeaders(msg)}
        <div>{RenderMessageValue(msg, shouldExpand)}</div>
    </div>
}

function RenderMessageValue(msg: TopicMessage, shouldExpand?: ((x: CollapsedFieldProps) => boolean)) {
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
                let hex = '';
                for (let i = 0; i < str.length; i++) {
                    let n = str.charCodeAt(i).toString(16);
                    if (n.length == 1) n = '0' + n;
                    hex += n + ' ';
                }

                return <code style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}>{hex}</code>
            }
            else {
                const str = msg.value as string;
                let result = '';
                const isPrintable = /[\x20-\x7E]/;
                for (let i = 0; i < str.length; i++) {
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

                <KowlJsonView src={msg.value} shouldCollapse={shouldCollapse} />
            </>
        )
    }
    catch (e) {
        return <span style={{ color: 'red' }}>Error in RenderExpandedMessage: {e.toString()}</span>
    }
}

function RenderMessageHeaders(msg: TopicMessage) {
    return <div className='messageHeaders'>
        <div className='title'>Message Headers</div>
        {QuickTable(msg.headers, {
            tableStyle: { width: 'auto', paddingLeft: '1em' },
        })}
    </div>
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
class ColumnSettings extends Component<{ allCurrentKeys: string[], getShowDialog: () => boolean, setShowDialog: (show: boolean) => void }> {

    render() {

        const content = <>
            <Paragraph>
                <Text>
                    Click on the column field on the text field and/or <b>x</b> on to remove it.<br />
                </Text>
            </Paragraph>
            <div style={{ padding: '1.5em 1em', background: 'rgba(200, 205, 210, 0.16)', borderRadius: '4px' }}>
                <ColumnOptions tags={uiState.topicSettings.previewColumnFields} />
            </div>
            <div style={{ marginTop: '1em' }}>
                <h3 style={{ marginBottom: '0.5em' }}>More Settings</h3>
                <Space size='large'>
                    <OptionGroup label='Timestamp' options={{ 'Local DateTime': 'default', 'Unix Seconds': 'unixSeconds', 'Relative': 'relative', 'Local Date': 'onlyDate', 'Local Time': 'onlyTime' }}
                        value={uiState.topicSettings.previewTimestamps}
                        onChange={e => uiState.topicSettings.previewTimestamps = e}
                    />
                </Space>
            </div>
        </>

        return <Modal
            title={<span><FilterOutlined style={{ fontSize: '22px', verticalAlign: 'bottom', marginRight: '16px', color: 'hsla(209, 20%, 35%, 1)' }} />Column Settings</span>}
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
class ColumnOptions extends Component<{ tags: ColumnList[] }> {

    defaultColumnList: ColumnList[] = [
        { title: 'Offset', dataIndex: 'offset' },
        { title: 'Partition', dataIndex: 'partitionID' },
        { title: 'Timestamp', dataIndex: 'timestamp' },
        { title: 'Key', dataIndex: 'key' },
        { title: 'Headers', dataIndex: 'headers' },
        { title: 'Value', dataIndex: 'value' },
        { title: 'Size', dataIndex: 'size' },
    ];

    render() {
        const defaultValues = uiState.topicSettings.previewColumnFields.map(column => column.title);
        const children = this.defaultColumnList.map((column: ColumnList) =>
            <Option value={column.dataIndex} key={column.dataIndex}>{column.title}</Option>
        );

        return <>
            <Select
                mode="multiple"
                style={{ width: '100%' }}
                placeholder="Currently on default View, please select"
                defaultValue={defaultValues}
                onChange={this.handleColumnListChange}
            >
                {children}
            </Select>
        </>
    }

    handleColumnListChange = (values: string[]) => {
        if (!values.length) {
            uiState.topicSettings.previewColumnFields = [];
        } else {
            const columnsSelected = values
                .map(value => this.defaultColumnList.find(columnList => columnList.dataIndex === value))
                .filter(columnList => !!columnList) as ColumnList[];
            uiState.topicSettings.previewColumnFields = columnsSelected;
        }
    }
}

@observer
class CustomTagList extends Component<{ tags: PreviewTag[], allCurrentKeys: string[] }> {
    @observable inputVisible = false;
    @observable inputValue = '';

    @observable activeTags: string[] = [];

    render() {

        const tagSuggestions = this.props.allCurrentKeys.filter(k => this.props.tags.all(t => t.value != k));
        console.log('tag suggestions', this.props.allCurrentKeys)

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
                                    options={tagSuggestions.map(t => ({ label: t, value: t }))}
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


const makeHelpEntry = (title: string, content: ReactNode, popTitle?: string): ReactNode => (
    <Popover key={title} trigger='click' title={popTitle} content={content}>
        <Button type='link' size='small' style={{ fontSize: '1.2em' }}>{title}</Button>
    </Popover>
)

// TODO Explain:
// - multiple filters are combined with &&
// - 'return' is optional if you only have an expression! as is ';'
// - more examples for 'value', along with 'find(...)'
const helpEntries = [
    makeHelpEntry('Basics', <ul style={{ margin: 0, paddingInlineStart: '15px' }}>
        <li>The filter code is a javascript function body (click 'parameters' to see what arguments are available)</li>
        <li>Return true to allow a message, Return false to discard the message</li>
        <li>The context is re-used between messages, but every partition has its own context</li>
        <li>You can omit the 'return' keyword if your filter is just an 'expression'</li>
        <li>Multiple filters are combined with 'and'. Meaning that ALL filters have to return true for the message to pass.</li>
    </ul>),
    makeHelpEntry('Parameters', <ul style={{ margin: 0, paddingInlineStart: '15px' }}>
        <li><span className='codeBox'>offset</span> (number)</li>
        <li><span className='codeBox'>partitionId</span> (number)</li>
        <li><span className='codeBox'>key</span> (string)</li>
        <li><span className='codeBox'>value</span> (object)</li>
    </ul>),
    makeHelpEntry('Examples', <ul style={{ margin: 0, paddingInlineStart: '15px' }}>
        <li style={{ margin: '1em 0' }}><span className='codeBox'>offset &gt; 10000</span></li>
        <li style={{ margin: '1em 0' }}><span className='codeBox'>if (key == 'example') return true</span></li>
        <li style={{ margin: '1em 0' }}><span className='codeBox'>return (partitionId == 2) &amp;&amp; (value.someProperty == 'test-value')</span></li>
        <li style={{ margin: '1em 0' }}><div style={{ border: '1px solid #ccc', borderRadius: '4px' }}><img src={filterExample1} loading='lazy' /></div></li>
        <li style={{ margin: '1em 0' }}><div style={{ border: '1px solid #ccc', borderRadius: '4px' }}><img src={filterExample2} loading='lazy' /></div></li>
    </ul>),
].genericJoin((last, cur, curIndex) => <div key={'separator_' + curIndex} style={{ display: 'inline', borderLeft: '1px solid #0003' }} />)

@observer
class MessageSearchFilterBar extends Component {
    /*
    todo:
        - does a click outside of the editor mean "ok" or "cancel"?
            - maybe don't allow closing by clicking outside?
            - ok: so we can make quick changes
        - maybe submit the code live, show syntax errors below
        - maybe havee a button that runs the code against the newest message?
     */

    @observable currentFilter: FilterEntry | null = null;
    currentFilterBackup: string | null = null; // json of 'currentFilter'
    currentIsNew = false; // true: 'onCancel' must remove the filter again

    @observable hasChanges = false; // used by editor; shows "revert changes" when true

    static readonly nameTip = <>
        <LayoutBypass justifyContent='flex-start'>
            <Tooltip placement='top' title={<span>Enter a custom name that will be shown in the list.<br />Otherwise the the code itself will be used as the name.</span>}>
                <QuestionCircleTwoTone twoToneColor='deepskyblue' style={{ fontSize: '15px' }} />
            </Tooltip>
        </LayoutBypass>
    </>

    render() {
        const settings = uiState.topicSettings.searchParams;

        return <div className={styles.filterbar}>

            <div className={styles.filters}>
                {/* Existing Tags List  */}
                {settings.filters?.map(e =>
                    <Tag
                        style={{ userSelect: 'none' }}
                        className={e.isActive ? 'filterTag' : 'filterTag filterTagDisabled'}
                        key={e.id}
                        closable
                        color={e.isActive ? 'blue' : undefined}
                        onClose={() => settings.filters.remove(e)}
                    >
                        <SettingOutlined
                            className='settingIconFilter'
                            onClick={() => {
                                this.currentIsNew = false;
                                this.currentFilterBackup = ToJson(e);
                                this.currentFilter = e;
                                this.hasChanges = false;
                            }}
                        />
                        <span className={`filterName ${styles.filterName}`} onClick={() => e.isActive = !e.isActive}>
                            {e.name ? e.name : (e.code ? e.code : 'New Filter')}
                        </span>
                    </Tag>
                )}

                {/* Add Filter Button */}
                <Tag onClick={() => transaction(() => {
                    this.currentIsNew = true;
                    this.currentFilterBackup = null;
                    this.currentFilter = new FilterEntry();
                    this.hasChanges = false;
                    settings.filters.push(this.currentFilter);
                })}>
                    <span className={styles.addFilter}> {/* marginRight: '4px' */}
                        <PlusIcon size='small' />
                    </span>
                    {/* <span>New Filter</span> */}
                </Tag>
            </div>

            {console.log(api.messageSearchPhase)}

            {api.messageSearchPhase === null || api.messageSearchPhase === 'Done'
                ? (
                    <div className={styles.metaSection}>
                        <span><DownloadOutlined className={styles.bytesIcon} /> {prettyBytes(api.messagesBytesConsumed)}</span>
                        <span className={styles.time}><ClockCircleOutlined className={styles.timeIcon} /> {prettyMilliseconds(api.messagesElapsedMs || -1)}</span>
                    </div>
                )
                : (
                    <div className={`${styles.metaSection} ${styles.isLoading}`}>
                        <span className={`spinner ${styles.spinner}`} />
                        <span className={`pulsating ${styles.spinnerText}`}>Fetching data...</span>
                    </div>
                )
            }




            {/* Editor */}
            <Modal centered visible={this.currentFilter != null}
                //title='Edit Filter'
                closable={false}
                title={null}
                onOk={() => this.currentFilter = null}
                onCancel={() => this.currentFilter = null}

                destroyOnClose={true}
                // footer={null}

                okText='Close'
                cancelButtonProps={{ style: { display: 'none' } }}
                maskClosable={true}
                footer={<div style={{ display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <div style={{ fontFamily: '"Open Sans", sans-serif', fontSize: '10.5px', color: '#828282' }}>
                        Changes are saved automatically
                    </div>
                    <Button type='primary' onClick={() => this.currentFilter = null} >Close</Button>
                </div>}

                bodyStyle={{ paddingTop: '18px', paddingBottom: '12px', display: 'flex', gap: '12px', flexDirection: 'column' }}
            >
                {this.currentFilter && <>

                    {/* Title */}
                    <span style={{ display: 'inline-flex', alignItems: 'center', marginBottom: '8px' }}>
                        <span className='h3' style={{ marginRight: '0.3em' }}>Edit Filter</span>
                        <Button style={{
                            opacity: this.hasChanges ? 1 : 0,
                            transform: this.hasChanges ? '' : 'translate(-10px 0px)',
                            transition: 'all 0.4s ease-out',
                            fontFamily: '"Open Sans", sans-serif',
                            fontSize: '73%',
                        }}
                            danger type='dashed' size='small'
                            onClick={() => this.revertChanges()}
                        >
                            Revert Changes
                        </Button>
                    </span>

                    {/* Name */}
                    <Label text='Display Name'>
                        <Input
                            style={{ padding: '2px 8px' }}
                            value={this.currentFilter!.name}
                            onChange={e => { this.currentFilter!.name = e.target.value; this.hasChanges = true; }}
                            placeholder='will be shown instead of the code'
                            size='small' />
                    </Label>

                    {/* Code Box */}
                    <Label text='Filter Code'>
                        <Editor
                            value={this.currentFilter!.code}
                            onValueChange={code => { this.currentFilter!.code = code; this.hasChanges = true; }}
                            highlight={code => Prism.highlight(code, PrismLanguages["javascript"], "javascript")}
                            padding={10}
                            style={{
                                fontFamily: '"Fira code", "Fira Mono", monospace',
                                fontSize: 12,
                                minWidth: '300px',
                                minHeight: '200px',
                                border: '1px solid #0004',
                                outline: 'none',
                                borderRadius: '2px',
                            }}
                            textareaClassName='code-editor-textarea'
                        />
                    </Label>

                    {/* Help Bar */}
                    <Alert type='info' style={{ margin: '0px', padding: '3px 8px', }} message={<>
                        <span style={{ fontFamily: '"Open Sans", sans-serif', fontWeight: 600, fontSize: '80%', color: '#0009' }}>
                            <span>Help:</span>
                            {helpEntries}
                        </span>
                    </>} />

                </>}
            </Modal>
        </div>
    }



    revertChanges() {
        if (this.currentFilter && this.currentFilterBackup) {
            const restored = JSON.parse(this.currentFilterBackup);
            if (restored)
                Object.assign(this.currentFilter, restored);
            this.hasChanges = false;
        }
    }
}
