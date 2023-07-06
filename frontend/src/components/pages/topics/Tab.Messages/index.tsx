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

import { ClockCircleOutlined, DeleteOutlined, DownloadOutlined, EllipsisOutlined, FilterOutlined, SettingFilled, SettingOutlined } from '@ant-design/icons';
import { DownloadIcon, PlusIcon, SkipIcon, SyncIcon, XCircleIcon } from '@primer/octicons-react';
import { ConfigProvider, DatePicker, Dropdown, Empty, Menu, message, Modal, Popover, Radio, Row, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { ColumnProps } from 'antd/lib/table';
import { SortOrder } from 'antd/lib/table/interface';
import Paragraph from 'antd/lib/typography/Paragraph';
import { action, autorun, computed, IReactionDisposer, makeObservable, observable, transaction, untracked } from 'mobx';
import { observer } from 'mobx-react';
import * as moment from 'moment';
import React, { Component, ReactNode } from 'react';
import FilterEditor from './Editor';
import filterExample1 from '../../../../assets/filter-example-1.png';
import filterExample2 from '../../../../assets/filter-example-2.png';
import { api } from '../../../../state/backendApi';
import { CompressionType, compressionTypeToNum, EncodingType, Payload, PublishRecord, Topic, TopicAction, TopicMessage } from '../../../../state/restInterfaces';
import { Feature, isSupported } from '../../../../state/supportedFeatures';
import { ColumnList, FilterEntry, PreviewTagV2, PartitionOffsetOrigin } from '../../../../state/ui';
import { uiState } from '../../../../state/uiState';
import { AnimatePresence, animProps_span_messagesStatus, MotionDiv, MotionSpan } from '../../../../utils/animationProps';
import '../../../../utils/arrayExtensions';
import { IsDev } from '../../../../utils/env';
import { isClipboardAvailable } from '../../../../utils/featureDetection';
import { FilterableDataSource } from '../../../../utils/filterableDataSource';
import { sanitizeString, wrapFilterFragment } from '../../../../utils/filterHelper';
import { toJson } from '../../../../utils/jsonUtils';
import { editQuery } from '../../../../utils/queryHelper';
import { Ellipsis, findPopupContainer, Label, numberToThousandsString, OptionGroup, StatusIndicator, TimestampDisplay, toSafeString } from '../../../../utils/tsxUtils';
import { cullText, encodeBase64, prettyBytes, prettyMilliseconds, titleCase } from '../../../../utils/utils';
import { makePaginationConfig, range, sortField } from '../../../misc/common';
import { KowlJsonView } from '../../../misc/KowlJsonView';
import { NoClipboardPopover } from '../../../misc/NoClipboardPopover';
import DeleteRecordsModal from '../DeleteRecordsModal/DeleteRecordsModal';
import { PublishMessageModalProps, PublishMessagesModalContent } from '../PublishMessagesModal/PublishMessagesModal';
import { getPreviewTags, PreviewSettings } from './PreviewSettings';
import styles from './styles.module.scss';
import createAutoModal from '../../../../utils/createAutoModal';
import { CollapsedFieldProps } from '@textea/json-viewer';
import { Button, Input, InputGroup, Switch, Alert, AlertIcon, Tabs as RpTabs, Box, SearchField } from '@redpanda-data/ui';
import { MdExpandMore } from 'react-icons/md';
import { SingleSelect } from '../../../misc/Select';
import { isServerless } from '../../../../config';

const { Text } = Typography;
const { Option } = Select;

interface TopicMessageViewProps {
    topic: Topic;
    refreshTopicData: (force: boolean) => void;
}

/*
    TODO:
        - when the user has entered a specific offset, we should prevent selecting 'all' partitions, as that wouldn't make any sense.
        - add back summary of quick search  <this.FilterSummary />
*/

@observer
export class TopicMessageView extends Component<TopicMessageViewProps> {
    @observable previewDisplay: string[] = [];
    // @observable allCurrentKeys: string[];

    @observable showColumnSettings = false;

    @observable fetchError = null as any | null;

    pageConfig = makePaginationConfig(uiState.topicSettings.messagesPageSize);
    messageSource = new FilterableDataSource<TopicMessage>(() => api.messages, this.isFilterMatch, 16);

    autoSearchReaction: IReactionDisposer | null = null;
    quickSearchReaction: IReactionDisposer | null = null;

    currentSearchRun: string | null = null;

    @observable downloadMessages: TopicMessage[] | null;
    @observable expandedKeys: React.Key[] = [];

    @observable deleteRecordsModalVisible = false;
    @observable deleteRecordsModalAlive = false;

    PublishRecordsModal;
    showPublishRecordsModal;

    constructor(props: TopicMessageViewProps) {
        super(props);
        this.executeMessageSearch = this.executeMessageSearch.bind(this); // needed because we must pass the function directly as 'submit' prop

        const m = createPublishRecordsModal(this);
        this.PublishRecordsModal = m.Component;
        this.showPublishRecordsModal = m.show;

        makeObservable(this);
    }

    componentDidMount() {
        // unpack query parameters (if any)
        const searchParams = uiState.topicSettings.searchParams;
        const query = new URLSearchParams(window.location.search);
        // console.debug("parsing query: " + toJson(query));
        if (query.has('p')) searchParams.partitionID = Number(query.get('p'));
        if (query.has('s')) searchParams.maxResults = Number(query.get('s'));
        if (query.has('o')) {
            searchParams.startOffset = Number(query.get('o'));
            searchParams.offsetOrigin = (searchParams.startOffset >= 0) ? PartitionOffsetOrigin.Custom : searchParams.startOffset;
        }
        if (query.has('q')) uiState.topicSettings.quickSearch = String(query.get('q'));

        // Auto search when parameters change
        this.autoSearchReaction = autorun(() => this.searchFunc('auto'), { delay: 100, name: 'auto search when parameters change' });

        // Quick search -> url
        this.quickSearchReaction = autorun(() => {
            editQuery(query => {
                if (uiState.topicSettings.quickSearch)
                    query['q'] = uiState.topicSettings.quickSearch;
                else
                    query['q'] = undefined;
            });
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
                ? <Alert status="error">
                    <AlertIcon />
                    <div>Backend API Error</div>
                    <div>
                        <Text>Please check and modify the request before resubmitting.</Text>
                        <div className="codeBox">{((this.fetchError as Error).message ?? String(this.fetchError))}</div>
                        <Button onClick={() => this.executeMessageSearch()}>
                            Retry Search
                        </Button>
                    </div>
                </Alert>
                : <>
                    <Row align="middle" style={{ marginBottom: '0rem', display: 'flex', alignItems: 'center' }} >
                        {/*
                            todo: move this below the table (aligned left)
                            This requires more work becasue we'd have to remove the pagination controls from the table and provide our own
                         */}
                        {/* <this.SearchQueryAdditionalInfo /> */}
                    </Row>

                    <this.MessageTable />
                </>
            }

            {
                this.deleteRecordsModalAlive
                && (
                    <DeleteRecordsModal
                        topic={this.props.topic}
                        visible={this.deleteRecordsModalVisible}
                        onCancel={() => this.deleteRecordsModalVisible = false}
                        onFinish={() => {
                            this.deleteRecordsModalVisible = false;
                            this.props.refreshTopicData(true);
                            this.searchFunc('auto');
                        }}
                        afterClose={() => this.deleteRecordsModalAlive = false}
                    />
                )
            }

            <this.PublishRecordsModal />
        </>;
    }
    SearchControlsBar = observer(() => {
        const searchParams = uiState.topicSettings.searchParams;
        const topic = this.props.topic;
        const spaceStyle = { marginRight: '16px', marginTop: '12px' };
        const canUseFilters = (api.topicPermissions.get(topic.topicName)?.canUseSearchFilters ?? true) && !isServerless();

        const isCompacted = this.props.topic.cleanupPolicy.includes('compact');

        const startOffsetOptions = [
            { value: PartitionOffsetOrigin.End, label: 'Newest' },
            { value: PartitionOffsetOrigin.EndMinusResults, label: 'Newest - ' + String(searchParams.maxResults) },
            { value: PartitionOffsetOrigin.Start, label: 'Oldest' },
            { value: PartitionOffsetOrigin.Custom, label: 'Custom' },
            { value: PartitionOffsetOrigin.Timestamp, label: 'Timestamp' },
        ];

        return <React.Fragment>
            <div style={{ margin: '0 1px', marginBottom: '12px', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', position: 'relative', zIndex: 2 }}>
                {/* Search Settings*/}
                <Label text="Partition" style={{ ...spaceStyle, minWidth: '9em' }}>
                    <SingleSelect<number>
                        value={searchParams.partitionID}
                        onChange={c => searchParams.partitionID = c}
                        // style={{ width: '9em' }}
                        options={[
                            { value: -1, label: 'All' }
                        ].concat(range(0, topic.partitionCount).map(i => ({ value: i, label: String(i) })))}
                    />
                </Label>
                <Label text="Start Offset" style={{ ...spaceStyle }}>
                    <InputGroup>
                        <SingleSelect<PartitionOffsetOrigin>
                            value={searchParams.offsetOrigin}
                            onChange={e => searchParams.offsetOrigin = e}
                            options={startOffsetOptions}
                        />
                        {
                            searchParams.offsetOrigin == PartitionOffsetOrigin.Custom &&
                            <Input style={{ width: '7.5em' }} maxLength={20}
                                value={searchParams.startOffset} onChange={e => searchParams.startOffset = +e.target.value}
                                isDisabled={searchParams.offsetOrigin != PartitionOffsetOrigin.Custom} />
                        }
                        {
                            searchParams.offsetOrigin == PartitionOffsetOrigin.Timestamp &&
                            <StartOffsetDateTimePicker />
                        }
                    </InputGroup>
                </Label>
                <Label text="Max Results" style={{ ...spaceStyle, minWidth: '9em' }}>
                    <SingleSelect<number>
                        value={searchParams.maxResults}
                        onChange={c => searchParams.maxResults = c}
                        options={[1, 3, 5, 10, 20, 50, 100, 200, 500].map(i => ({ value: i }))}
                    />
                </Label>

                {!isServerless() &&
                    <Label text="Filter" style={{ ...spaceStyle }}>
                        <div style={{ height: '32px', paddingTop: '4px' }}>
                            <Tooltip title="You don't have permissions to use search filters in this topic" trigger={canUseFilters ? 'none' : 'hover'}>
                                <Switch size="lg" isChecked={searchParams.filtersEnabled && canUseFilters} onChange={v => searchParams.filtersEnabled = v.target.checked} isDisabled={!canUseFilters} />
                            </Tooltip>
                        </div>
                    </Label>
                }

                {/* Refresh Button */}
                <Label text="" style={{ ...spaceStyle }}>
                    <div style={{ display: 'flex' }}>

                        <AnimatePresence>
                            {api.messageSearchPhase == null &&
                                <MotionSpan identityKey="btnRefresh" overrideAnimProps={animProps_span_messagesStatus}>
                                    <Tooltip title="Repeat current search" getPopupContainer={findPopupContainer}>
                                        <Button variant="outline" onClick={() => this.searchFunc('manual')}>
                                            <SyncIcon size={16} />
                                        </Button>
                                    </Tooltip>
                                </MotionSpan>
                            }
                            {api.messageSearchPhase != null &&
                                <MotionSpan identityKey="btnCancelSearch" overrideAnimProps={animProps_span_messagesStatus}>
                                    <Tooltip title="Stop searching" getPopupContainer={findPopupContainer}>
                                        <Button variant="solid" colorScheme="red" onClick={() => api.stopMessageSearch()} style={{ padding: 0, width: '48px' }}>
                                            <XCircleIcon size={20} />
                                        </Button>
                                    </Tooltip>
                                </MotionSpan>
                            }
                        </AnimatePresence>
                    </div>
                </Label>

                {/* Topic Actions */}
                <div className={styles.topicActionsWrapper}>
                    <Dropdown trigger={['click']} overlay={<Menu>
                        <Menu.Item key="1" onClick={() => this.showPublishRecordsModal({ topicName: this.props.topic.topicName })}>
                            Publish Message
                        </Menu.Item>
                        {DeleteRecordsMenuItem('2', isCompacted, topic.allowedActions ?? [], () => this.deleteRecordsModalAlive = this.deleteRecordsModalVisible = true)}
                    </Menu>}>
                        <Button variant="outline" minWidth="120px" gap="2" className="topicActionsButton">Actions<MdExpandMore size="1.5rem" /></Button>
                    </Dropdown>

                </div>

                {/* Quick Search */}
                <Box>
                    <SearchField
                        width="230px"
                        marginLeft="6"
                        searchText={this.fetchError == null ? uiState.topicSettings.quickSearch : ''}
                        setSearchText={x => uiState.topicSettings.quickSearch = x}
                    />
                </Box>

                {/* Search Progress Indicator: "Consuming Messages 30/30" */}
                {
                    Boolean(api.messageSearchPhase && api.messageSearchPhase.length > 0) &&
                    <StatusIndicator
                        identityKey="messageSearch"
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

            </div>

        </React.Fragment>;
    });

    searchFunc = (source: 'auto' | 'manual') => {

        // need to do this first, so we trigger mobx
        const params = uiState.topicSettings.searchParams;
        const searchParams = String(params.offsetOrigin) + params.maxResults + params.partitionID + params.startOffset + params.startTimestamp;

        if (this.currentSearchRun) {
            if (IsDev) console.warn(`searchFunc: function already in progress (trigger:${source})`);
            return;
        }

        const phase = untracked(() => api.messageSearchPhase);
        if (phase) {
            if (IsDev) console.warn(`searchFunc: previous search still in progress (trigger:${source}, phase:${phase})`);
            return;
        }

        try {
            this.currentSearchRun = searchParams;

            if (this.fetchError == null)
                untracked(() => this.executeMessageSearch());
        } catch (error) {
            console.error(error);
        } finally {
            this.currentSearchRun = null;
        }
    };

    cancelSearch = () => api.stopMessageSearch();

    isFilterMatch(str: string, m: TopicMessage) {
        str = uiState.topicSettings.quickSearch.toLowerCase();
        if (m.offset.toString().toLowerCase().includes(str)) return true;
        if (m.keyJson && m.keyJson.toLowerCase().includes(str)) return true;
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
                <Text type="secondary">{displayText}</Text>
            </MotionDiv>
        </div>;
    }

    @computed
    get activePreviewTags(): PreviewTagV2[] {
        return uiState.topicSettings.previewTags.filter(t => t.isActive);
    }

    MessageTable = observer(() => {

        const [showPreviewSettings, setShowPreviewSettings] = React.useState(false);

        const previewButton = <>
            <span style={{ display: 'inline-flex', alignItems: 'center', height: 0, marginLeft: '4px' }}>
                <Button variant="outline" size="sm" className="hoverBorder" onClick={() => setShowPreviewSettings(true)} bg="transparent" px="2" lineHeight="0">
                    <SettingOutlined style={{ fontSize: '1rem' }} />
                    <span style={{ marginLeft: '.3em' }}>Preview</span>
                    {(() => {
                        const count = uiState.topicSettings.previewTags.sum(t => t.isActive ? 1 : 0);
                        if (count > 0)
                            return <span style={{ marginLeft: '.3em' }}>(<b>{count} active</b>)</span>;
                        return <></>;
                    })()}
                </Button>
            </span>
        </>;



        const tsFormat = uiState.topicSettings.previewTimestamps;
        const IsColumnSettingsEnabled = uiState.topicSettings.previewColumnFields.length || uiState.topicSettings.previewTimestamps !== 'default';
        const hasKeyTags = uiState.topicSettings.previewTags.count(x => x.isActive && x.searchInMessageKey) > 0;

        const columns: ColumnProps<TopicMessage>[] = [
            { width: 1, title: 'Offset', dataIndex: 'offset', sorter: sortField('offset'), defaultSortOrder: 'descend', render: (t: number) => numberToThousandsString(t) },
            { width: 1, title: 'Partition', dataIndex: 'partitionID', sorter: sortField('partitionID'), },
            { width: 1, title: 'Timestamp', dataIndex: 'timestamp', sorter: sortField('timestamp'), render: (t: number) => <TimestampDisplay unixEpochSecond={t} format={tsFormat} /> },
            {
                width: hasKeyTags ? '30%' : 1, title: 'Key', dataIndex: 'key',
                render: (_, r) => <MessageKeyPreview msg={r} previewFields={() => this.activePreviewTags} />,
                sorter: this.keySorter
            },
            {
                dataIndex: 'value',
                width: 'auto',
                title: <span>Value {previewButton}</span>,
                render: (_t, r) => <MessagePreview msg={r} previewFields={() => this.activePreviewTags} isCompactTopic={this.props.topic.cleanupPolicy.includes('compact')} />,
                //filteredValue: ['?'],
                //onFilter: (value, record) => { console.log(`Filtering value: ${value}`); return true; },
            },
            {
                width: 1, title: ' ', key: 'action', className: 'msgTableActionColumn',
                filters: [],
                filterDropdownVisible: false,
                onFilterDropdownVisibleChange: (_) => this.showColumnSettings = true,
                filterIcon: (_) => {
                    return <Tooltip title="Column Settings" mouseEnterDelay={0.1} getPopupContainer={findPopupContainer} placement="left">
                        <SettingFilled style={IsColumnSettingsEnabled ? { color: 'hsl(255 15% 65%)' } : { color: '#a092a0' }} />
                    </Tooltip>;
                },
                render: (_text, record) => (
                    <NoClipboardPopover placement="left">
                        <div> {/* the additional div is necessary because popovers do not trigger on disabled elements, even on hover */}
                            <Dropdown disabled={!isClipboardAvailable} overlayClassName="disableAnimation" overlay={this.copyDropdown(record)} trigger={['click']}>
                                <Button className="iconButton" style={{ height: '100%', width: '100%', verticalAlign: 'middle', pointerEvents: isClipboardAvailable ? 'auto' : 'none' }} variant="link">
                                    <EllipsisOutlined style={{ fontSize: '32px', display: 'flex', alignContent: 'center', justifyContent: 'center' }} />
                                </Button>
                            </Dropdown>
                        </div>
                    </NoClipboardPopover>
                ),
            },
            // todo: size was a guess anyway, might be added back later
            // {
            //     width: 1, title: 'Size', dataIndex: 'size', render: (s) => { if (s > 1000) s = Math.round(s / 1000) * 1000; return prettyBytes(s) },
            //     sorter: (a, b) => b.size - a.size
            // },
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

        const showTombstones = this.props.topic.cleanupPolicy.includes('compact');

        return <>
            <ConfigProvider renderEmpty={this.empty}>
                <Table
                    style={{ margin: '0', padding: '0', whiteSpace: 'nowrap' }}
                    size="middle"
                    showSorterTooltip={false}
                    pagination={this.pageConfig}
                    onChange={(pagination) => {
                        if (pagination.pageSize) uiState.topicSettings.messagesPageSize = pagination.pageSize;
                        this.pageConfig.current = pagination.current;
                        this.pageConfig.pageSize = pagination.pageSize;
                    }}

                    dataSource={this.messageSource.data}

                    rowKey={r => r.offset + ' ' + r.partitionID + r.timestamp}
                    rowClassName={(r: TopicMessage) => (r.value.isPayloadNull && showTombstones) ? 'tombstone' : ''}
                    onRow={r => {
                        return {
                            onDoubleClick: e => {
                                // Double clicking a row should expand/collapse it
                                // But not when the user double-clicks the expand/collapse button
                                if (e.target instanceof HTMLElement)
                                    if (e.target.classList.contains('ant-table-row-expand-icon'))
                                        return;
                                this.toggleRecordExpand(r);
                            },
                        };
                    }}

                    expandable={{
                        expandRowByClick: false,
                        expandIconColumnIndex: filteredColumns.findIndex(c => c.dataIndex === 'offset'),
                        rowExpandable: () => true,
                        expandedRowRender: record => renderExpandedMessage(record),
                        expandedRowKeys: this.expandedKeys.slice(),
                        onExpand: (_p, r) => {
                            this.toggleRecordExpand(r);
                        }
                    }}

                    columns={filteredColumns}
                />

                <Button variant="outline" style={{ marginTop: '4px', marginLeft: '-2px' }}
                    onClick={() => { this.downloadMessages = api.messages; }}
                    isDisabled={!api.messages || api.messages.length == 0}
                >
                    <span style={{ paddingRight: '4px' }}><DownloadIcon /></span>
                    Save Messages
                </Button>

                <SaveMessagesDialog messages={this.downloadMessages} onClose={() => this.downloadMessages = null} />

                {
                    (this.messageSource?.data?.length > 0) &&
                    <PreviewSettings getShowDialog={() => showPreviewSettings} setShowDialog={s => setShowPreviewSettings(s)} />
                }

                <ColumnSettings getShowDialog={() => this.showColumnSettings} setShowDialog={s => this.showColumnSettings = s} />


            </ConfigProvider>
        </>;
    });


    @action toggleRecordExpand(r: TopicMessage) {
        const key = r.offset + ' ' + r.partitionID + r.timestamp;
        // try collapsing it, removeAll returns the number of matches
        const removed = this.expandedKeys.removeAll(x => x == key);
        if (removed == 0) // wasn't expanded, so expand it now
            this.expandedKeys.push(key);
    }

    keySorter(a: TopicMessage, b: TopicMessage, _sortOrder?: SortOrder): number {
        const ta = String(a.key) ?? '';
        const tb = String(b.key) ?? '';
        return ta.localeCompare(tb);
    }

    copyDropdown = (record: TopicMessage) => (
        <Menu>
            <Menu.Item key="0" disabled={record.key.isPayloadNull} onClick={() => copyMessage(record, 'jsonKey')}>
                Copy Key
            </Menu.Item>
            <Menu.Item key="2" disabled={record.value.isPayloadNull} onClick={() => copyMessage(record, 'jsonValue')}>
                Copy Value
            </Menu.Item>
            <Menu.Item key="4" onClick={() => copyMessage(record, 'timestamp')}>
                Copy Epoch Timestamp
            </Menu.Item>
            <Menu.Item key="5" onClick={() => this.downloadMessages = [record]}>
                Save to File
            </Menu.Item>
        </Menu>
    );

    async executeMessageSearch(): Promise<void> {
        const searchParams = uiState.topicSettings.searchParams;
        const canUseFilters = (api.topicPermissions.get(this.props.topic.topicName)?.canUseSearchFilters ?? true) && !isServerless();

        if (searchParams.offsetOrigin != PartitionOffsetOrigin.Custom)
            searchParams.startOffset = searchParams.offsetOrigin;

        editQuery(query => {
            query['p'] = String(searchParams.partitionID); // p = partition
            query['s'] = String(searchParams.maxResults); // s = size
            query['o'] = String(searchParams.startOffset); // o = offset
        });

        let filterCode: string = '';
        if (searchParams.filtersEnabled && canUseFilters) {
            const functionNames: string[] = [];
            const functions: string[] = [];

            searchParams.filters.filter(e => e.isActive && e.code && e.transpiledCode).forEach(e => {
                const name = `filter${functionNames.length + 1}`;
                functionNames.push(name);
                functions.push(`function ${name}() {
                    ${wrapFilterFragment(e.transpiledCode)}
                }`);
            });

            if (functions.length > 0) {
                filterCode = functions.join('\n\n') + '\n\n'
                    + `return ${functionNames.map(f => f + '()').join(' && ')}`;
                if (IsDev) console.log(`constructed filter code (${functions.length} functions)`, '\n\n' + filterCode);
            }
        }

        const request = {
            topicName: this.props.topic.topicName,
            partitionId: searchParams.partitionID,
            startOffset: searchParams.startOffset,
            startTimestamp: searchParams.startTimestamp,
            maxResults: searchParams.maxResults,
            filterInterpreterCode: encodeBase64(sanitizeString(filterCode)),
        };

        // if (typeof searchParams.startTimestamp != 'number' || searchParams.startTimestamp == 0)
        //     console.error("startTimestamp is not valid", { request: request, searchParams: searchParams });

        transaction(async () => {
            try {
                this.fetchError = null;
                api.startMessageSearch(request);
            } catch (error: any) {
                console.error('error in searchTopicMessages: ' + ((error as Error).message ?? String(error)));
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
            case 'json': return <Tag key={1} color="orange">JSON</Tag>;
            case 'xml': return <Tag key={2} color="green">XML</Tag>;
            case 'avro': return <Tag key={3} color="blue">Avro</Tag>;
            case 'binary': return <Tag key={4} color="red">Binary</Tag>;
            case 'text': return <Tag key={5} color="gold">Text</Tag>;
            case '': return null;
        }
        return <Tag key={6} color="black">Unknown: {type}</Tag>;
    }

    empty = () => {
        const searchParams = uiState.topicSettings.searchParams;
        const filterCount = searchParams.filtersEnabled ? searchParams.filters.filter(x => x.isActive).length : 0;

        const hints: JSX.Element[] = [];
        if (filterCount > 0)
            hints.push(<>There are <b>{filterCount} filters</b> in use by the current search. Keep in mind that messages must pass <b>every</b> filter when using more than one filter at the same time.</>);
        if (searchParams.startOffset == PartitionOffsetOrigin.End)
            hints.push(<><b>Start offset</b> is set to "Newest". Make sure messages are being sent to the topic.</>);

        const hintBox = hints.length ? <ul className={styles.noMessagesHint}>
            {hints.map((x, i) => <li key={i}>{x}</li>)}
        </ul> : null;

        return (
            <Empty description={<>
                <Text type="secondary" strong style={{ fontSize: '125%' }}>No messages</Text>
                {hintBox}
            </>} />
        );
    };
}

@observer
class SaveMessagesDialog extends Component<{ messages: TopicMessage[] | null, onClose: () => void; }> {
    @observable isOpen = false;
    @observable format = 'json' as 'json' | 'csv';

    radioStyle = { display: 'block', lineHeight: '30px' };

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    render() {
        const { messages, onClose } = this.props;
        const count = (messages?.length ?? 0);
        const title = count > 1 ? 'Save Messages' : 'Save Message';

        // Keep dialog open after closing it, so it can play its closing animation
        if (count > 0 && !this.isOpen) setTimeout(() => this.isOpen = true);
        if (this.isOpen && count == 0) setTimeout(() => this.isOpen = false);

        return <Modal
            title={title} centered closable={false}
            open={count > 0}
            onOk={() => this.saveMessages()}
            onCancel={onClose}
            afterClose={onClose}
            okText="Save Messages"
        >
            <div>Select the format in which you want to save {count == 1 ? 'the message' : 'all messages'}</div>
            <Radio.Group value={this.format} onChange={e => this.format = e.target.value}>
                <Radio value="json" style={this.radioStyle}>JSON</Radio>
                <Radio value="csv" disabled={true} style={this.radioStyle}>CSV</Radio>
            </Radio.Group>
        </Modal>;
    }

    saveMessages() {
        const cleanMessages = this.cleanMessages(this.props.messages ?? []);

        const json = toJson(cleanMessages, 4);

        const link = document.createElement('a');
        const file = new Blob([json], { type: 'application/json' });
        link.href = URL.createObjectURL(file);
        link.download = 'messages.json';
        document.body.appendChild(link); // required in firefox
        link.click();

        this.props.onClose();
    }

    cleanMessages(messages: TopicMessage[]): any[] {
        const ar: any[] = [];

        // create a copy of each message, omitting properties that don't make
        // sense for the user, like 'size' or caching properties like 'keyJson'.

        const cleanPayload = function (p: Payload): Payload {
            if (!p) return undefined as any;
            return {
                payload: p.payload,
                encoding: p.encoding,
                schemaId: p.schemaId,
            } as any as Payload;
        };

        for (const src of messages) {
            const msg = {} as Partial<typeof src>;

            msg.partitionID = src.partitionID;
            msg.offset = src.offset;
            msg.timestamp = src.timestamp;
            msg.compression = src.compression;
            msg.isTransactional = src.isTransactional;

            msg.headers = src.headers.map(h => ({
                key: h.key,
                value: cleanPayload(h.value),
            }));

            msg.key = cleanPayload(src.key);
            msg.value = cleanPayload(src.value);

            ar.push(msg);
        }

        return ar;
    }
}


@observer
class MessageKeyPreview extends Component<{ msg: TopicMessage, previewFields: () => PreviewTagV2[]; }> {
    render() {
        const msg = this.props.msg;
        const key = msg.key;

        const isPrimitive =
            typeof key.payload === 'string' ||
            typeof key.payload === 'number' ||
            typeof key.payload === 'boolean';
        try {
            if (key.isPayloadNull)
                return renderEmptyIcon('Key is null');
            if (key.payload == null || key.payload.length == 0)
                return null;

            let text: ReactNode = <></>;

            if (key.encoding == 'binary') {
                text = cullText(msg.keyBinHexPreview, 44);
            }
            else if (key.encoding == 'utf8WithControlChars') {
                text = highlightControlChars(key.payload);
            }
            else if (isPrimitive) {
                text = cullText(key.payload, 44);
            }
            else {
                // Only thing left is 'object'
                // Stuff like 'bigint', 'function', or 'symbol' would not have been deserialized
                const previewTags = this.props.previewFields().filter(t => t.searchInMessageValue);
                if (previewTags.length > 0) {
                    const tags = getPreviewTags(key.payload, previewTags);
                    text = <span className="cellDiv fade" style={{ fontSize: '95%' }}>
                        <div className={'previewTags previewTags-' + uiState.topicSettings.previewDisplayMode}>
                            {tags.map((t, i) => <React.Fragment key={i}>{t}</React.Fragment>)}
                        </div>
                    </span>;
                    return text;
                }
                // Normal display (json, no filters). Just stringify the whole object
                text = cullText(JSON.stringify(key.payload), 44);
            }

            return <span className="cellDiv" style={{ minWidth: '10ch', width: 'auto', maxWidth: '45ch' }}>
                <code style={{ fontSize: '95%' }}>{text}</code>
            </span>;
        }
        catch (e) {
            return <span style={{ color: 'red' }}>Error in RenderPreview: {((e as Error).message ?? String(e))}</span>;
        }
    }
}


@observer
class StartOffsetDateTimePicker extends Component {

    constructor(p: any) {
        super(p);
        const searchParams = uiState.topicSettings.searchParams;
        // console.log('time picker 1', { setByUser: searchParams.startTimestampWasSetByUser, startTimestamp: searchParams.startTimestamp, format: new Date(searchParams.startTimestamp).toLocaleDateString() })
        if (!searchParams.startTimestampWasSetByUser) {
            // so far, the user did not change the startTimestamp, so we set it to 'now'
            searchParams.startTimestamp = new Date().getTime();
        }
        // console.log('time picker 2', { setByUser: searchParams.startTimestampWasSetByUser, startTimestamp: searchParams.startTimestamp, format: new Date(searchParams.startTimestamp).toLocaleDateString() })
    }

    render() {
        const searchParams = uiState.topicSettings.searchParams;
        // new Date().getTimezoneOffset()

        // startTimestamp is always in unixSeconds, so for display we might have to convert
        let format = 'DD.MM.YYYY HH:mm:ss';
        let current: moment.Moment | undefined = searchParams.startTimestamp <= 0 ? undefined : moment.utc(searchParams.startTimestamp);

        if (uiState.topicSettings.searchParametersLocalTimeMode) {
            current = current?.local();
            format += ' [(Local)]';
        } else {
            format += ' [(UTC)]';
        }

        return <DatePicker showTime={true} allowClear={false}
            renderExtraFooter={() => <DateTimePickerExtraFooter />}
            format={format}
            value={current}
            onChange={e => {
                // console.log('onChange', { value: e?.format() ?? 'null', isLocal: e?.isLocal(), unix: e?.valueOf() });
                searchParams.startTimestamp = e?.valueOf() ?? -1;
                searchParams.startTimestampWasSetByUser = true;
            }}
            onOk={e => {
                // console.log('onOk', { value: e.format(), isLocal: e.isLocal(), unix: e.valueOf() });
                searchParams.startTimestamp = e.valueOf();
            }}
        />;
    }
}

@observer
class DateTimePickerExtraFooter extends Component {
    render() {
        return <Radio.Group
            value={uiState.topicSettings.searchParametersLocalTimeMode ? 'local' : 'utc'}
            onChange={e => {
                // console.log("date mode changed", { newValue: e.target.value, isLocalMode: uiState.topicSettings.searchParametersLocalTimeMode });
                uiState.topicSettings.searchParametersLocalTimeMode = e.target.value == 'local';
            }}>
            <Radio value="local">Local</Radio>
            <Radio value="utc">UTC</Radio>
        </Radio.Group>;
    }
}


@observer
class MessagePreview extends Component<{ msg: TopicMessage, previewFields: () => PreviewTagV2[]; isCompactTopic: boolean }> {
    render() {
        const msg = this.props.msg;
        const value = msg.value;

        const isPrimitive =
            typeof value.payload === 'string' ||
            typeof value.payload === 'number' ||
            typeof value.payload === 'boolean';

        try {
            let text: ReactNode = <></>;



            if (value.isPayloadNull) {
                if (!this.props.isCompactTopic) {
                    return renderEmptyIcon('Value is null');
                }
                text = <><DeleteOutlined style={{ fontSize: 16, color: 'rgba(0,0,0, 0.35)', verticalAlign: 'text-bottom', marginRight: '4px', marginLeft: '1px' }} /><code>Tombstone</code></>;
            }
            else if (value.payload == null || value.payload.length == 0)
                return null;
            else if (msg.value.encoding == 'binary' || msg.value.encoding == 'utf8WithControlChars') {
                // If the original data was binary or had control characters, display as hex dump
                text = msg.valueBinHexPreview;
            }
            else if (isPrimitive) {
                // If we can show the value as a primitive, do so.
                text = value.payload;
            }
            else {
                // Only thing left is 'object'
                // Stuff like 'bigint', 'function', or 'symbol' would not have been deserialized
                const previewTags = this.props.previewFields().filter(t => t.searchInMessageValue);
                if (previewTags.length > 0) {
                    const tags = getPreviewTags(value.payload, previewTags);
                    text = <span className="cellDiv fade" style={{ fontSize: '95%' }}>
                        <div className={'previewTags previewTags-' + uiState.topicSettings.previewDisplayMode}>
                            {tags.map((t, i) => <React.Fragment key={i}>{t}</React.Fragment>)}
                        </div>
                    </span>;
                    return text;

                }
                else {
                    // Normal display (json, no filters). Just stringify the whole object
                    text = cullText(JSON.stringify(value.payload), 300);
                }
            }

            return <code><span className="cellDiv" style={{ fontSize: '95%' }}>{text}</span></code>;
        }
        catch (e) {
            return <span style={{ color: 'red' }}>Error in RenderPreview: {((e as Error).message ?? String(e))}</span>;
        }
    }
}


function renderExpandedMessage(msg: TopicMessage, shouldExpand?: ((x: CollapsedFieldProps) => boolean)) {
    return <div className="expandedMessage">
        <MessageMetaData msg={msg} />

        {/* .ant-tabs-nav { width: ??; } */}
        <RpTabs
            size="lg"
            defaultIndex={1}
            items={[
                {
                    key: 'key',
                    name: <Box minWidth="6rem">Key</Box>,
                    isDisabled: msg.key == null || msg.key.size == 0,
                    component: renderPayload(msg.key, shouldExpand)
                },
                {
                    key: 'value',
                    name: <Box minWidth="6rem">Value</Box>,
                    component: renderPayload(msg.value, shouldExpand)
                },
                {
                    key: 'headers',
                    name: <Box minWidth="6rem">Headers</Box>,
                    isDisabled: msg.headers.length == 0,
                    component: <MessageHeaders msg={msg} />
                },
            ]}
        />
    </div>;
}

function renderPayload(payload: Payload, shouldExpand?: ((x: CollapsedFieldProps) => boolean)) {
    try {
        if (payload === null || payload === undefined || payload.payload === null || payload.payload === undefined)
            return <code>null</code>;

        const val = payload.payload;
        const isPrimitive =
            typeof val === 'string' ||
            typeof val === 'number' ||
            typeof val === 'boolean';

        const shouldCollapse = shouldExpand ? shouldExpand : false;

        if (payload.encoding == 'binary') {
            const mode = 'ascii' as ('ascii' | 'raw' | 'hex');
            if (mode == 'raw') {
                return <code style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}>{val}</code>;
            }
            else if (mode == 'hex') {
                const str = String(val);
                let hex = '';
                for (let i = 0; i < str.length; i++) {
                    let n = str.charCodeAt(i).toString(16);
                    if (n.length == 1) n = '0' + n;
                    hex += n + ' ';
                }

                return <code style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}>{hex}</code>;
            }
            else {
                const str = String(val);
                let result = '';
                const isPrintable = /[\x20-\x7E]/;
                for (let i = 0; i < str.length; i++) {
                    let ch = String.fromCharCode(str.charCodeAt(i)); // str.charAt(i);
                    ch = isPrintable.test(ch) ? ch : '. ';
                    result += ch + ' ';
                }

                return <code style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}>{result}</code>;
            }
        }

        // Decode payload from base64 and render control characters as code highlighted text, such as
        // `NUL`, `ACK` etc.
        if (payload.encoding == 'utf8WithControlChars') {
            const elements = highlightControlChars(val);

            return <div className="codeBox">{elements}</div>;
        }

        if (isPrimitive) {
            return <div className="codeBox">{String(val)}</div>;
        }

        return <KowlJsonView src={val} shouldCollapse={shouldCollapse} />;
    }
    catch (e) {
        return <span style={{ color: 'red' }}>Error in RenderExpandedMessage: {((e as Error).message ?? String(e))}</span>;
    }
}

function highlightControlChars(str: string, maxLength?: number): JSX.Element[] {
    const elements: JSX.Element[] = [];
    // To reduce the number of JSX elements we try to append normal chars to a single string
    // until we hit a control character.
    let sequentialChars = '';
    let numChars = 0;

    for (const char of str) {
        const code = char.charCodeAt(0);
        if (code < 32) {
            if (sequentialChars.length > 0) {
                elements.push(<>{sequentialChars}</>)
                sequentialChars = ''
            }
            elements.push(<span className="controlChar">{getControlCharacterName(code)}</span>)
        } else {
            sequentialChars += char;
        }

        if (maxLength != undefined) {
            numChars++;
            if (numChars >= maxLength)
                break;
        }
    }

    if (sequentialChars.length > 0)
        elements.push(<>{sequentialChars}</>);

    return elements;
}

function getControlCharacterName(code: number): string {
    switch (code) {
        case 0: return 'NUL';
        case 1: return 'SOH';
        case 2: return 'STX';
        case 3: return 'ETX';
        case 4: return 'EOT';
        case 5: return 'ENQ';
        case 6: return 'ACK';
        case 7: return 'BEL';
        case 8: return 'BS';
        case 9: return 'HT';
        case 10: return 'LF';
        case 11: return 'VT';
        case 12: return 'FF';
        case 13: return 'CR';
        case 14: return 'SO';
        case 15: return 'SI';
        case 16: return 'DLE';
        case 17: return 'DC1';
        case 18: return 'DC2';
        case 19: return 'DC3';
        case 20: return 'DC4';
        case 21: return 'NAK';
        case 22: return 'SYN';
        case 23: return 'ETB';
        case 24: return 'CAN';
        case 25: return 'EM';
        case 26: return 'SUB';
        case 27: return 'ESC';
        case 28: return 'FS';
        case 29: return 'GS';
        case 30: return 'RS';
        case 31: return 'US';
        default: return '';
    }
};

const MessageMetaData = observer((props: { msg: TopicMessage; }) => {
    const msg = props.msg;
    const data = {
        'Key': msg.key.isPayloadNull ? 'Null' : `${titleCase(msg.key.encoding)} (${prettyBytes(msg.key.size)})`,
        'Value': msg.value.isPayloadNull ? 'Null' : `${titleCase(msg.value.encoding)} (${msg.value.schemaId > 0 ? `${msg.value.schemaId} / ` : ''}${prettyBytes(msg.value.size)})`,
        'Headers': msg.headers.length > 0 ? `${msg.headers.length}` : 'No headers set',
        'Compression': msg.compression,
        'Transactional': msg.isTransactional ? 'true' : 'false',
        // "Producer ID": "(msg.producerId)",
    };

    return <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: '0.75rem', gap: '1em 3em', color: 'rgba(0, 0, 0, 0.8)', margin: '1em 0em 1.5em .3em' }}>
        {Object.entries(data).map(([k, v]) => <React.Fragment key={k}>
            <div style={{ display: 'flex', rowGap: '.4em', flexDirection: 'column', fontFamily: 'Open Sans' }}>
                <div style={{ fontWeight: 600 }}>{k}</div>
                <div style={{ color: 'rgba(0, 0, 0, 0.6)', }}>{v}</div>
            </div>
        </React.Fragment>)}
    </div>;
});

const MessageHeaders = observer((props: { msg: TopicMessage; }) => {

    return <div className="messageHeaders">
        <div>
            <Table
                size="small" style={{ margin: '0', padding: '0' }}
                indentSize={0}
                dataSource={props.msg.headers}
                pagination={false}
                columns={[
                    {
                        width: 200, title: 'Key', dataIndex: 'key',
                        render: headerKey => <span className="cellDiv" style={{ width: 'auto' }}>
                            {headerKey
                                ? <Ellipsis>{toSafeString(headerKey)}</Ellipsis>
                                : renderEmptyIcon('Empty Key')}
                        </span>
                    },
                    {
                        width: 'auto', title: 'Value', dataIndex: 'value',
                        render: headerValue => {
                            if (typeof headerValue.payload === 'undefined') return renderEmptyIcon('"undefined"');
                            if (headerValue.payload === null) return renderEmptyIcon('"null"');
                            if (typeof headerValue.payload === 'number') return <span>{String(headerValue.payload)}</span>;

                            if (typeof headerValue.payload === 'string')
                                return <span className="cellDiv">{headerValue.payload}</span>;

                            // object
                            return <span className="cellDiv">{toSafeString(headerValue.payload)}</span>;
                        },
                    },
                    {
                        width: 120, title: 'Encoding', dataIndex: 'value',
                        render: payload => <span className="nowrap">{payload.encoding}</span>
                    },
                ]}
                expandable={{
                    rowExpandable: header => (typeof header.value?.payload === 'object' && header.value?.payload != null) || typeof header.value?.payload === 'string', // names of 'value' and 'payload' should be swapped; but has to be fixed in backend
                    expandIconColumnIndex: 1,
                    expandRowByClick: true,
                    expandedRowRender: header => typeof header.value?.payload !== 'object'
                        ? <div className="codeBox" style={{ margin: '0', width: '100%' }}>{toSafeString(header.value.payload)}</div>
                        : <KowlJsonView src={header.value.payload as object} style={{ margin: '2em 0' }} />,
                }}
                rowKey={r => r.key}
            />
            <br />
        </div>
    </div>;
});


@observer
class ColumnSettings extends Component<{ getShowDialog: () => boolean, setShowDialog: (show: boolean) => void; }> {

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
                <Space size="large">
                    <OptionGroup label="Timestamp" options={{
                        'Local DateTime': 'default',
                        'Unix DateTime': 'unixTimestamp',
                        'Relative': 'relative',
                        'Local Date': 'onlyDate',
                        'Local Time': 'onlyTime',
                        'Unix Seconds': 'unixSeconds',
                    }}
                        value={uiState.topicSettings.previewTimestamps}
                        onChange={e => uiState.topicSettings.previewTimestamps = e}
                    />
                </Space>
            </div>
        </>;

        return <Modal
            title={<span><FilterOutlined style={{ fontSize: '22px', verticalAlign: 'bottom', marginRight: '16px', color: 'hsla(209, 20%, 35%, 1)' }} />Column Settings</span>}
            open={this.props.getShowDialog()}
            onOk={() => this.props.setShowDialog(false)}
            onCancel={() => this.props.setShowDialog(false)}
            width={750}
            okText="Close"
            cancelButtonProps={{ style: { display: 'none' } }}
            closable={false}
            maskClosable={true}
        >
            {content}
        </Modal>;
    }
}

@observer
class ColumnOptions extends Component<{ tags: ColumnList[]; }> {

    defaultColumnList: ColumnList[] = [
        { title: 'Offset', dataIndex: 'offset' },
        { title: 'Partition', dataIndex: 'partitionID' },
        { title: 'Timestamp', dataIndex: 'timestamp' },
        { title: 'Key', dataIndex: 'key' },
        // { title: 'Headers', dataIndex: 'headers' },
        { title: 'Value', dataIndex: 'value' },
        // { title: 'Size', dataIndex: 'size' }, // size of the whole message is not available (bc it was a bad guess), might be added back later
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
        </>;
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
    };
}


const makeHelpEntry = (title: string, content: ReactNode, popTitle?: string): ReactNode => (
    <Popover key={title} trigger="click" title={popTitle} content={content} overlayClassName="noArrow" overlayStyle={{ maxWidth: '600px' }}
    >
        <Button variant="link" size="small" style={{ fontSize: '1.2em' }}>{title}</Button>
    </Popover>
);

// TODO Explain:
// - multiple filters are combined with &&
// - 'return' is optional if you only have an expression! as is ';'
// - more examples for 'value', along with 'find(...)'
const helpEntries = [
    makeHelpEntry('Basics', <ul style={{ margin: 0, paddingInlineStart: '15px' }}>
        <li>The filter code is a javascript function body (click 'parameters' to see what arguments are available)</li>
        <li>Return true to allow a message, return false to discard the message.</li>
        <li>You can omit the 'return' keyword if your filter is just an 'expression'</li>
        <li>If you have multiple active filters, they're combined with 'and'. Meaning that ALL filters a message is tested on must return true for it to be passed to the frontend.</li>
        <li>The context is re-used between messages, but every partition has its own context</li>
    </ul>),
    makeHelpEntry('Parameters', <ul style={{ margin: 0, paddingInlineStart: '15px' }}>
        <li><span className="codeBox">offset</span> (number)</li>
        <li><span className="codeBox">partitionID</span> (number)</li>
        <li><span className="codeBox">key</span> (string)</li>
        <li><span className="codeBox">value</span> (object)</li>
        <li><span className="codeBox">headers</span> (object)</li>
    </ul>),
    makeHelpEntry('Examples', <ul style={{ margin: 0, paddingInlineStart: '15px' }}>
        <li style={{ margin: '1em 0' }}><span className="codeBox">offset &gt; 10000</span></li>
        <li style={{ margin: '1em 0' }}><span className="codeBox">value != null</span> Skips tombstone messages</li>
        <li style={{ margin: '1em 0' }}><span className="codeBox">if (key == 'example') return true</span></li>
        <li style={{ margin: '1em 0' }}><span className="codeBox">headers.myVersionHeader &amp;&amp; (headers.myVersionHeader &gt;&eq; 2)</span> Only messages that have a header entry like {'{key: "myVersionHeader", "value:" 12345}'}</li>
        <li style={{ margin: '1em 0' }}><span className="codeBox">return (partitionID == 2) &amp;&amp; (value.someProperty == 'test-value')</span></li>
        <li style={{ margin: '1em 0' }}><div style={{ border: '1px solid #ccc', borderRadius: '4px' }}><img src={filterExample1} alt="Filter Example 1" loading="lazy" /></div></li>
        <li style={{ margin: '1em 0' }}><div style={{ border: '1px solid #ccc', borderRadius: '4px' }}><img src={filterExample2} alt="Filter Example 2" loading="lazy" /></div></li>
    </ul>),
].genericJoin((_last, _cur, curIndex) => <div key={'separator_' + curIndex} style={{ display: 'inline', borderLeft: '1px solid #0003' }} />);

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

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

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
                        onClose={() => settings.filters.remove(e)}
                    >
                        <SettingOutlined
                            className="settingIconFilter"
                            onClick={() => {
                                this.currentIsNew = false;
                                this.currentFilterBackup = toJson(e);
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
                        <PlusIcon size="small" />
                    </span>
                    {/* <span>New Filter</span> */}
                </Tag>
            </div>

            {api.messageSearchPhase === null || api.messageSearchPhase === 'Done'
                ? (
                    <div className={styles.metaSection}>
                        <span><DownloadOutlined className={styles.bytesIcon} /> {prettyBytes(api.messagesBytesConsumed)}</span>
                        <span className={styles.time}><ClockCircleOutlined className={styles.timeIcon} /> {api.messagesElapsedMs ? prettyMilliseconds(api.messagesElapsedMs) : ''}</span>
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
            <Modal centered open={this.currentFilter != null}
                //title='Edit Filter'
                closable={false}
                title={null}
                onOk={() => this.currentFilter = null}
                onCancel={() => this.currentFilter = null}

                destroyOnClose={true}
                // footer={null}

                okText="Close"
                cancelButtonProps={{ style: { display: 'none' } }}
                maskClosable={true}
                footer={<div style={{ display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <div style={{ fontFamily: '"Open Sans", sans-serif', fontSize: '10.5px', color: '#828282' }}>
                        Changes are saved automatically
                    </div>
                    <Button variant="solid" onClick={() => this.currentFilter = null} >Close</Button>
                </div>}

                bodyStyle={{ paddingTop: '18px', paddingBottom: '12px', display: 'flex', gap: '12px', flexDirection: 'column' }}
            >
                {this.currentFilter && <>

                    {/* Title */}
                    <span style={{ display: 'inline-flex', alignItems: 'center', marginBottom: '8px' }}>
                        <span className="h3" style={{ marginRight: '0.3em' }}>Edit Filter</span>
                        <Button style={{
                            opacity: this.hasChanges ? 1 : 0,
                            transform: this.hasChanges ? '' : 'translate(-10px 0px)',
                            transition: 'all 0.4s ease-out',
                            fontFamily: '"Open Sans", sans-serif',
                            fontSize: '73%',
                        }}
                            colorScheme="red" variant="outline" size="small"
                            onClick={() => this.revertChanges()}
                        >
                            Revert Changes
                        </Button>
                    </span>

                    {/* Name */}
                    <Label text="Display Name">
                        <Input
                            style={{ padding: '2px 8px' }}
                            value={this.currentFilter!.name}
                            onChange={e => { this.currentFilter!.name = e.target.value; this.hasChanges = true; }}
                            placeholder="will be shown instead of the code"
                            size="small" />
                    </Label>

                    {/* Code Box */}
                    <Label text="Filter Code">
                        <>
                            <FilterEditor
                                value={this.currentFilter!.code}
                                onValueChange={(code, transpiled) => { this.currentFilter!.code = code; this.currentFilter!.transpiledCode = transpiled; this.hasChanges = true; }}

                            />
                        </>
                    </Label>

                    {/* Help Bar */}
                    <Alert status="info" style={{ margin: '0px', padding: '3px 8px', }}>
                        <AlertIcon />
                        <span style={{ fontFamily: '"Open Sans", sans-serif', fontWeight: 600, fontSize: '80%', color: '#0009' }}>
                            <span>Help:</span>
                            {helpEntries}
                        </span>
                    </Alert>

                </>}
            </Modal>
        </div>;
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

function renderEmptyIcon(tooltipText?: string) {
    if (!tooltipText) tooltipText = 'Empty';
    return <Tooltip title={tooltipText} mouseEnterDelay={0.1} getPopupContainer={findPopupContainer}><span style={{ opacity: 0.66, marginLeft: '2px' }}><SkipIcon /></span></Tooltip>;
}

function hasDeleteRecordsPrivilege(allowedActions: Array<TopicAction>) {
    return allowedActions.includes('deleteTopicRecords') || allowedActions.includes('all');
}

function DeleteRecordsMenuItem(key: string, isCompacted: boolean, allowedActions: Array<TopicAction>, onClick: () => void,) {
    const isEnabled = !isCompacted && hasDeleteRecordsPrivilege(allowedActions) && isSupported(Feature.DeleteRecords);

    let errorText: string | undefined;
    if (isCompacted)
        errorText = 'Records on Topics with the \'compact\' cleanup policy cannot be deleted.';
    else if (!hasDeleteRecordsPrivilege(allowedActions))
        errorText = 'You\'re not permitted to delete records on this topic.';
    else if (!isSupported(Feature.DeleteRecords))
        errorText = 'The cluster doesn\'t support deleting records.';


    let content: JSX.Element | string = 'Delete Records';
    if (errorText)
        content = <Tooltip placement="top" title={errorText}>{content}</Tooltip>;

    return <Menu.Item key={key} disabled={!isEnabled} onClick={onClick}>{content}</Menu.Item>;
}




// we can only write text to the clipboard, so rawKey/rawValue have been removed for now
function copyMessage(record: TopicMessage, field: 'jsonKey' | 'jsonValue' | 'timestamp') {
    switch (field) {
        case 'jsonKey':
            typeof record.key.payload === 'string'
                ? navigator.clipboard.writeText(record.key.payload as string)
                : navigator.clipboard.writeText(JSON.stringify(record.key.payload, null, 4));
            message.success('Key copied to clipboard', 5);
            break;
        case 'jsonValue':
            typeof record.value.payload === 'string'
                ? navigator.clipboard.writeText(record.value.payload as string)
                : navigator.clipboard.writeText(JSON.stringify(record.value.payload, null, 4));
            message.success('Value copied to clipboard', 5);
            break;
        case 'timestamp':
            navigator.clipboard.writeText(record.timestamp.toString());
            message.success('Epoch Timestamp copied to clipboard', 5);
            break;
        default:
        // empty
    }
}

function createPublishRecordsModal(parent: TopicMessageView) {
    return createAutoModal({
        modalProps: {
            title: 'Produce Message',
            width: '80%',
            style: { minWidth: '690px', maxWidth: '1000px' },
            bodyStyle: { paddingTop: '1em' },
            centered: true,

            okText: 'Publish',

            closable: false,
            keyboard: false,
            maskClosable: false,
        },
        onCreate: (showArg: { topicName: string; }) => {
            return observable({
                topics: [showArg.topicName],
                partition: -1, // -1 = auto
                compressionType: CompressionType.Uncompressed,
                encodingType: uiState.topicSettings.produceRecordEncoding || 'json',

                key: '',
                value: '',
                headers: [{ key: '', value: '' }],
            } as PublishMessageModalProps['state']);
        },
        isOkEnabled: s => s.topics.length >= 1,
        onOk: async state => {

            if (state.encodingType === 'json')
                // try parsing just to make sure its actually json
                JSON.parse(state.value);

            const convert: { [key in EncodingType]: (x: string) => string | null } = {
                'none': () => null,
                'base64': x => x.trim(),
                'json': x => encodeBase64(x.trim()),
                'utf8': x => encodeBase64(x),
            };
            const value = convert[state.encodingType](state.value);

            const record: PublishRecord = {
                headers: state.headers.filter(h => h.key && h.value).map(h => ({ key: h.key, value: encodeBase64(h.value) })),
                key: encodeBase64(state.key),
                partitionId: state.partition,
                value: value,
            };

            const result = await api.publishRecords({
                compressionType: compressionTypeToNum(state.compressionType),
                records: [record],
                topicNames: state.topics,
                useTransactions: false,
            });


            const errors = [
                result.error,
                ...result.records.filter(x => x.error).map(r => `Topic "${r.topicName}": \n${r.error}`)
            ].filterFalsy();

            if (errors.length)
                throw new Error(errors.join('\n\n'));

            if (result.records.length == 1)
                return <>Record published on partition <span className="codeBox">{result.records[0].partitionId}</span> with offset <span className="codeBox">{result.records[0].offset}</span></>
            return <>{result.records.length} records published successfully</>;

        },
        onSuccess: (state) => {
            uiState.topicSettings.produceRecordEncoding = state.encodingType;
            parent.props.refreshTopicData(true);
            parent.searchFunc('auto');
        },
        content: (state) => <PublishMessagesModalContent state={state} />,
    })

}

