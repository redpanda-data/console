import React, { Component, useRef } from "react";
import { observer } from "mobx-react";
import { ConfigProvider, Empty, Input, Popover, Table, Tooltip } from "antd";
import { makePaginationConfig, renderLogDirSummary, sortField, WarningToolip } from "../../misc/common";
import { Partition, PartitionReassignmentsPartition, Topic } from "../../../state/restInterfaces";
import { BrokerList } from "./components/BrokerList";
import { IndeterminateCheckbox } from "./components/IndeterminateCheckbox";
import { SelectionInfoBar } from "./components/StatisticsBars";
import { DebugTimerStore, prettyBytesOrNA } from "../../../utils/utils";
import { ColumnProps } from "antd/lib/table/Column";
import { DefaultSkeleton, findPopupContainer, LayoutBypass, OptionGroup, InfoText } from "../../../utils/tsxUtils";
import { api } from "../../../state/backendApi";
import { computed, IReactionDisposer, makeObservable, observable, transaction } from "mobx";
import { PartitionSelection } from "./ReassignPartitions";
import Highlighter from 'react-highlight-words';
import { uiSettings } from "../../../state/ui";
import { ColumnFilterItem, ColumnsType, ExpandableConfig, FilterDropdownProps, TableRowSelection } from "antd/lib/table/interface";
import { SearchOutlined, WarningTwoTone } from "@ant-design/icons";
import { AlertIcon } from "@primer/octicons-v2-react";

export type TopicWithPartitions = Topic & { partitions: Partition[], activeReassignments: PartitionReassignmentsPartition[] };

@observer
export class StepSelectPartitions extends Component<{ partitionSelection: PartitionSelection, throttledTopics: string[] }> {
    pageConfig = makePaginationConfig(uiSettings.reassignment.pageSizeSelect ?? 10);
    autorunHandle: IReactionDisposer | undefined = undefined;
    @observable filterOpen = false; // topic name searchbar

    @observable selectedBrokerFilters: (string | number)[] | null = null;
    expandableConfig: ExpandableConfig<TopicWithPartitions>;

    constructor(props: any) {
        super(props);
        this.setSelection = this.setSelection.bind(this);
        this.setTopicSelection = this.setTopicSelection.bind(this);
        this.isSelected = this.isSelected.bind(this);
        this.getSelectedPartitions = this.getSelectedPartitions.bind(this);
        this.getTopicCheckState = this.getTopicCheckState.bind(this);
        this.getRowKey = this.getRowKey.bind(this);

        this.expandableConfig = {
            // expandedRowKeys: this.expandedTopics.slice(),
            // onExpandedRowsChange: keys => {
            //     // console.log('replacing expanded row keys', { current: this.expandedTopics, new: keys })
            //     this.expandedTopics = keys as string[];
            // },
            // expandIconColumnIndex: 1,
            expandedRowRender: topic => topic.partitions
                ? <SelectPartitionTable
                    topic={topic}
                    topicPartitions={topic.partitions}
                    isSelected={this.isSelected}
                    setSelection={this.setSelection}
                    getSelectedPartitions={() => this.getSelectedPartitions(topic.topicName)}
                />
                : <>Error loading partitions</>,
        };

        makeObservable(this);
    }

    componentWillUnmount() {
        if (this.autorunHandle) {
            this.autorunHandle();
            this.autorunHandle = undefined;
        }
    }

    render() {
        if (!api.topics) return DefaultSkeleton;

        const query = uiSettings.reassignment.quickSearch ?? "";
        const filterActive = query.length > 1;

        let searchRegex: RegExp | undefined = undefined;
        if (filterActive) try { searchRegex = new RegExp(uiSettings.reassignment.quickSearch, 'i') } catch { return null; }

        const rackToBrokers = this.rackToBrokers;

        const columns: ColumnProps<TopicWithPartitions>[] = [
            {
                title: <SearchTitle title='Topic' isFilterOpen={() => this.filterOpen} setFilterOpen={x => this.filterOpen = x} />,
                dataIndex: 'topicName',
                render: (v, record) => {
                    const content = filterActive
                        ? <Highlighter searchWords={[query]} textToHighlight={record.topicName} />
                        : record.topicName;

                    if (this.props.throttledTopics.includes(record.topicName))
                        return <div>
                            <span>{content}</span>
                            <WarningToolip content="Topic replication is throttled" position="top" />
                        </div>

                    return content;
                },

                sorter: sortField('topicName'), defaultSortOrder: 'ascend',

                // to support both filters at the same time (topic and brokers), both filters *must* be in controlled mode
                filteredValue: filterActive ? [query] : undefined,
                onFilter: (value, record) => searchRegex?.test(record.topicName) ?? false,

                filterIcon: filterIcon(filterActive),
                filterDropdown: <></>,
                filterDropdownVisible: this.filterOpen,
                onFilterDropdownVisibleChange: visible => {
                    // only accept requests to open the filter
                    if (visible) this.filterOpen = visible;
                },
            },
            {
                title: 'Partitions', width: 140,
                render: (_, t) => {
                    const errors = t.partitions.count(p => p.hasErrors);
                    if (errors == 0) return t.partitionCount;

                    return <span>
                        <span>{t.partitionCount - errors} / {t.partitionCount}</span>
                        {' '}
                        {renderPartitionErrorsForTopic(errors)}
                    </span>
                },
                sorter: sortField('partitionCount')
            },
            {
                title: 'Replication Factor', width: 160, render: (t, r) => {
                    if (r.activeReassignments.length == 0) return r.replicationFactor;
                    return <InfoText tooltip="While reassignment is active, replication factor is temporarily doubled." maxWidth="180px">
                        {r.replicationFactor}
                    </InfoText>
                },
                sorter: sortField('replicationFactor')
            },
            {
                title: 'Brokers', width: 160, dataIndex: 'partitions',
                render: (value, record) => record.partitions?.map(p => p.leader).distinct().length ?? 'N/A',

                // to support both filters at the same time (topic and brokers), both filters *must* be in controlled mode
                filteredValue: this.selectedBrokerFilters,
                filters: this.brokerFilters,
                onFilter: (v, r) => {
                    if (typeof v === 'number') {
                        // Broker ID
                        return r.partitions.any(p => p.replicas.includes(v));
                    }
                    if (typeof v === 'string') {
                        // Rack
                        const brokers = rackToBrokers.get(v);
                        if (!brokers) return false;
                        return r.partitions.any(p => p.replicas.intersection(brokers).length > 0);
                    }
                    return false;
                },
                filterMultiple: true,
            },
            {
                title: 'Size', width: 110,
                render: (v, r) => renderLogDirSummary(r.logDirSummary),
                sorter: (a, b) => a.logDirSummary.totalSizeBytes - b.logDirSummary.totalSizeBytes
            },
        ];


        return <>
            <div style={{ margin: '1em 1em 2em 1em' }}>

                {/* Current Selection */}
                <SelectionInfoBar partitionSelection={this.props.partitionSelection} margin="2em 0em 1em 0.3em" />

                {/* Topic / Partitions */}
                <ConfigProvider getPopupContainer={t => {
                    let c = t as HTMLElement | null | undefined;
                    while (c && c.tagName != 'TH' && c.tagName != 'TD')
                        c = c.parentElement;
                    return c ?? t;
                }}>

                    <Table
                        style={{ margin: '0', }} size={'middle'}
                        pagination={this.pageConfig}
                        onChange={(p, filters, sorters) => {
                            if (p.pageSize) uiSettings.reassignment.pageSizeSelect = p.pageSize;
                            this.pageConfig.current = p.current;
                            this.pageConfig.pageSize = p.pageSize;

                            const brokerFilters = filters['partitions']?.filterNull() ?? null;
                            brokerFilters?.removeAll(x => typeof x === 'boolean');

                            this.selectedBrokerFilters = brokerFilters as ((string | number)[] | null);
                        }}

                        dataSource={this.topicPartitions}
                        columns={columns}
                        showSorterTooltip={false}

                        rowKey={this.getRowKey}
                        rowClassName={'pureDisplayRow'}
                        onRow={r => ({
                            onClick: () => this.setTopicSelection(r, !this.getTopicCheckState(r.topicName).checked),
                            // onDoubleClick: () => this.expandedTopics.includes(record.topicName)
                            //     ? this.expandedTopics.remove(record.topicName)
                            //     : this.expandedTopics.push(record.topicName),
                        })}

                        rowSelection={{
                            type: 'checkbox',
                            columnTitle: <div style={{ display: 'flex' }} >
                                <InfoText tooltip={<>
                                    If you want to select multiple adjacent items, you can use the SHIFT key.<br />
                                    Shift-Click selects the first item, last item and all items in between.
                                </>} iconSize='16px' placement='right' />
                            </div>,
                            renderCell: (value: boolean, record, index, originNode: React.ReactNode) => {
                                return <IndeterminateCheckbox
                                    originalCheckbox={originNode}
                                    getCheckState={() => this.getTopicCheckState(record.topicName)}
                                />
                            },
                            onSelect: (record, selected: boolean, selectedRows) => {
                                if (!record.partitions) return;
                                this.setTopicSelection(record, selected);
                            },
                            onSelectMultiple: (selected, selectedRows, changeRows) => {
                                transaction(() => {
                                    for (const r of changeRows)
                                        for (const p of r.partitions)
                                            this.setSelection(r.topicName, p.id, selected && !p.hasErrors);
                                });
                            },
                        }}

                        expandable={this.expandableConfig}
                    />
                </ConfigProvider>
            </div>
        </>
    }

    getRowKey(r: TopicWithPartitions) {
        return r.topicName;
    }


    setTopicSelection(topic: TopicWithPartitions, isSelected: boolean) {
        transaction(() => {
            for (const p of topic.partitions) {
                const selected = isSelected && !p.hasErrors;
                this.setSelection(topic.topicName, p.id, selected);
            }
        });
    }

    setSelection(topic: string, partition: number, isSelected: boolean) {
        const partitions = this.props.partitionSelection[topic] ?? [];

        if (isSelected) {
            partitions.pushDistinct(partition);
        } else {
            partitions.remove(partition);
        }

        if (partitions.length == 0)
            delete this.props.partitionSelection[topic];
        else
            this.props.partitionSelection[topic] = partitions;
    }

    getSelectedPartitions(topic: string) {
        const partitions = this.props.partitionSelection[topic];
        if (!partitions) return [];
        return partitions;
    }

    isSelected(topic: string, partition: number) {
        const partitions = this.props.partitionSelection[topic];
        if (!partitions) return false;
        return partitions.includes(partition);
    }

    getTopicCheckState(topicName: string): { checked: boolean, indeterminate: boolean } {
        const tp = this.topicPartitions.first(t => t.topicName == topicName);
        if (!tp) return { checked: false, indeterminate: false };

        const selected = this.props.partitionSelection[topicName];
        if (!selected) return { checked: false, indeterminate: false };

        if (selected.length == 0)
            return { checked: false, indeterminate: false };

        const validPartitions = tp.partitions.count(x => !x.hasErrors);
        if (validPartitions > 0 && selected.length == validPartitions)
            return { checked: true, indeterminate: false };

        return { checked: false, indeterminate: true };
    }

    @computed get topicPartitions(): TopicWithPartitions[] {
        if (api.topics == null) return [];
        return api.topics.map(topic => {
            return {
                ...topic,
                partitions: api.topicPartitions.get(topic.topicName)!,
                activeReassignments: this.inProgress.get(topic.topicName) ?? [],
            }
        }).filter(t => t.activeReassignments.length == 0);
    }

    @computed get inProgress() {
        const current = api.partitionReassignments ?? [];
        return current.toMap(x => x.topicName, x => x.partitions);
    }

    @computed get allBrokers() {
        const brokerIdsOfTopicPartitions = this.topicPartitions.flatMap(t => t.partitions).flatMap(p => p.replicas).distinct();
        const allBrokers = api.clusterInfo?.brokers;
        if (!allBrokers || brokerIdsOfTopicPartitions.length == 0) return [];

        return allBrokers.filter(b => brokerIdsOfTopicPartitions.includes(b.brokerId));
    }

    @computed get rackToBrokers(): Map<string, number[]> {
        const brokers = this.allBrokers;
        const racks = brokers.map(b => b.rack).filterFalsy().distinct();

        // rack name => brokerIds
        return racks.toMap(
            r => r,
            r => brokers.filter(b => b.rack === r).map(b => b.brokerId).distinct())
    }

    @computed get brokerFilters(): ColumnFilterItem[] | undefined {
        const brokers = this.allBrokers;
        const racks = brokers.map(b => b.rack).filterFalsy().distinct();

        const brokerFilters: ColumnFilterItem[] = [];

        // Individual Brokers
        const brokerItems = brokers.map(b => ({ text: b.address, value: b.brokerId }));
        if (brokerItems.length > 0)
            brokerFilters.push({
                text: "Brokers", value: "Brokers",
                children: brokerItems,
            });

        // Racks
        if (racks.length > 0)
            brokerFilters.push({
                text: "Racks", value: "Racks",
                children: racks.map(r => ({ text: r, value: r })),
            });

        return brokerFilters;
    }
}

@observer
export class SelectPartitionTable extends Component<{
    topic: Topic;
    topicPartitions: Partition[];
    setSelection: (topic: string, partition: number, isSelected: boolean) => void;
    isSelected: (topic: string, partition: number) => boolean;
    getSelectedPartitions: () => number[];
}> {
    partitionsPageConfig = makePaginationConfig(100, true);
    scroll = { y: '300px' };
    rowClassName = (p: Partition) => p.hasErrors ? 'errorPartition' : '';

    columns: ColumnsType<Partition> = [
        { width: 100, title: 'Partition', dataIndex: 'id', sortOrder: 'ascend', sorter: (a, b) => a.id - b.id },
        {
            width: undefined, title: 'Brokers', render: (_, p) =>
                Boolean(p.replicas)
                    ? <BrokerList brokerIds={p.replicas} leaderId={p.leader} />
                    : renderPartitionError(p)
        },
        {
            width: 100, title: 'Size', render: (v, p) => prettyBytesOrNA(p.replicaSize),
            sortOrder: 'ascend', sorter: (a, b) => a.replicaSize - b.replicaSize
        },
    ];

    render() {
        return <div style={{ paddingTop: '4px', paddingBottom: '8px', width: 0, minWidth: '100%' }}>
            <Table size='small' className='nestedTable'
                dataSource={this.props.topicPartitions}
                pagination={this.partitionsPageConfig}
                scroll={this.scroll}
                rowClassName={this.rowClassName}
                rowKey={this.getRowKey}
                rowSelection={this.rowSelection}
                columns={this.columns} />
        </div>;
    }

    getRowKey(p: Partition) {
        return p.id;
    }

    @computed get rowSelection(): TableRowSelection<Partition> {
        return {
            type: 'checkbox',
            columnWidth: '43px',
            columnTitle: <></>,
            selectedRowKeys: this.props.getSelectedPartitions().slice(),
            getCheckboxProps: this.getCheckboxProps,
            onSelect: (p, selected) => this.props.setSelection(this.props.topic.topicName, p.id, selected && !p.hasErrors),
        }
    }

    getCheckboxProps(p: Partition) {
        return { disabled: p.hasErrors };
    }
}

@observer
class SearchTitle extends Component<{ title: string, isFilterOpen: () => boolean, setFilterOpen: (x: boolean) => void }> {
    inputRef = React.createRef<Input>(); // reference to input, used to focus it

    constructor(p: any) {
        super(p);
        this.hideSearchBar = this.hideSearchBar.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
    }

    render() {
        if (!this.props.isFilterOpen())
            return this.props.title;

        // Render the actual search bar

        setImmediate(() => { // inputRef won't be set yet, so we delay by one frame
            this.inputRef.current?.focus();
        });

        return <span>
            <span >{this.props.title}</span>
            <div className="tableInlineSearchBox"
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                onMouseUp={e => e.stopPropagation()}
                style={{
                    position: 'absolute', top: 0, right: '36px', bottom: 0, left: 0,
                    display: 'flex', placeContent: 'center', placeItems: 'center',
                    padding: '4px 6px',
                }}
            >
                <Input
                    ref={this.inputRef}
                    onBlur={e => {
                        const inputWrapper = e.target.parentElement;
                        const focusInside = inputWrapper?.contains((e.relatedTarget as HTMLElement));

                        if (focusInside) {
                            // Most likely a click on the "clear" button
                            uiSettings.reassignment.quickSearch = "";
                            this.hideSearchBar();
                        } else {

                            setTimeout(this.hideSearchBar);
                        }
                    }}
                    onKeyDown={this.onKeyDown}
                    allowClear={true}
                    placeholder="Enter search term or /regex/"
                    value={uiSettings.reassignment.quickSearch}
                    onChange={e => uiSettings.reassignment.quickSearch = e.target.value}
                    style={{ borderRadius: '3px' }}
                    spellCheck={false}
                />
            </div>
        </span>

    }

    hideSearchBar() {
        this.props.setFilterOpen(false);
    }

    onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key == 'Enter' || e.key == 'Escape')
            this.hideSearchBar();
    }
}


function filterIcon(filterActive: boolean) {
    return <div style={{
        background: filterActive ? 'hsl(208deg, 100%, 93%)' : undefined,
        position: 'absolute',
        left: 0, top: 0, right: 0, bottom: 0
    }}>
        <SearchOutlined style={{ color: filterActive ? '#1890ff' : 'hsl(0deg, 0%, 67%)', fontSize: '14px' }} />
    </div>
}

function renderPartitionError(partition: Partition) {
    const txt = [partition.partitionError, partition.waterMarksError].join('\n\n');

    return <Popover
        title='Partition Error'
        placement='rightTop' overlayClassName='popoverSmall'
        getPopupContainer={findPopupContainer}
        content={<div style={{ maxWidth: '500px', whiteSpace: 'pre-wrap' }}>
            {txt}
        </div>
        }
    >
        <span>
            <LayoutBypass justifyContent='center' alignItems='center' width='20px' height='18px'>
                <span style={{ fontSize: '19px' }}>
                    <WarningTwoTone twoToneColor='orange' />
                </span>
            </LayoutBypass>
        </span>
    </Popover>
}

function renderPartitionErrorsForTopic(partitionsWithErrors: number) {
    return <Popover
        title='Partition Error'
        placement='rightTop' overlayClassName='popoverSmall'
        getPopupContainer={findPopupContainer}
        content={<div style={{ maxWidth: '500px', whiteSpace: 'pre-wrap' }}>
            Some partitions could not be retreived.<br />
            Expand the topic to see which partitions are affected.
        </div>
        }
    >
        <span>
            <LayoutBypass justifyContent='center' alignItems='center' width='20px' height='18px'>
                <span style={{ fontSize: '19px' }}>
                    <WarningTwoTone twoToneColor='orange' />
                </span>
            </LayoutBypass>
        </span>
    </Popover>
}