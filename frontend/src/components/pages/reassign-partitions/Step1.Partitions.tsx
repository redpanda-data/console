import React, { Component, useRef } from "react";
import { observer } from "mobx-react";
import { ConfigProvider, Empty, Input, Table, Tooltip } from "antd";
import { makePaginationConfig, sortField } from "../../misc/common";
import { Partition, PartitionReassignmentsPartition, Topic } from "../../../state/restInterfaces";
import { BrokerList } from "./components/BrokerList";
import { IndeterminateCheckbox } from "./components/IndeterminateCheckbox";
import { SelectionInfoBar } from "./components/StatisticsBars";
import { DebugTimerStore, prettyBytesOrNA } from "../../../utils/utils";
import { ColumnProps } from "antd/lib/table/Column";
import { DefaultSkeleton, findPopupContainer, OptionGroup, TextInfoIcon } from "../../../utils/tsxUtils";
import { api } from "../../../state/backendApi";
import { computed, IReactionDisposer, observable, transaction } from "mobx";
import { PartitionSelection } from "./ReassignPartitions";
import Highlighter from 'react-highlight-words';
import { uiSettings } from "../../../state/ui";
import { FilterDropdownProps } from "antd/lib/table/interface";
import { SearchOutlined } from "@ant-design/icons";

export type TopicWithPartitions = Topic & { partitions: Partition[], activeReassignments: PartitionReassignmentsPartition[] };

@observer
export class StepSelectPartitions extends Component<{ partitionSelection: PartitionSelection }> {
    pageConfig = makePaginationConfig(uiSettings.reassignment.pageSizeSelect ?? 10);
    autorunHandle: IReactionDisposer | undefined = undefined;
    @observable filterOpen = false;

    constructor(props: any) {
        super(props);
        this.setSelection = this.setSelection.bind(this);
        this.isSelected = this.isSelected.bind(this);
        this.getSelectedPartitions = this.getSelectedPartitions.bind(this);
        this.getTopicCheckState = this.getTopicCheckState.bind(this);
    }

    componentWillUnmount() {
        if (this.autorunHandle) {
            this.autorunHandle();
            this.autorunHandle = undefined;
        }
    }

    render() {
        if (!api.topics) return DefaultSkeleton;
        if (api.topicPartitions.size == 0) return <Empty />

        let filterActive = uiSettings.reassignment.quickSearch?.length > 1;
        const searchWords = filterActive ? (uiSettings.reassignment.quickSearch?.split(' ') ?? []) : [];
        const searchRegexes = searchWords.map(w => {
            try { return new RegExp(w, 'i') } catch { return null; }
        }).filterNull();
        if (searchRegexes.length == 0)
            filterActive = false;


        const columns: ColumnProps<TopicWithPartitions>[] = [
            {
                title: <SearchTitle title='Topic' isFilterOpen={() => this.filterOpen} setFilterOpen={x => this.filterOpen = x} />,
                render: (v, record) => filterActive
                    ? <Highlighter searchWords={searchWords} textToHighlight={record.topicName} />
                    : record.topicName,

                sorter: sortField('topicName'), defaultSortOrder: 'ascend',

                filtered: filterActive,
                filteredValue: filterActive ? searchWords : null,
                onFilter: (value, record) => searchRegexes.any(r => r.test(record.topicName)),

                filterIcon: filterIcon(filterActive),
                filterDropdown: <></>,
                filterDropdownVisible: this.filterOpen,
                onFilterDropdownVisibleChange: visible => {
                    // only accept requests to open the filter
                    if (visible) this.filterOpen = visible;
                },
            },
            { title: 'Partitions', width: 130, dataIndex: 'partitionCount', sorter: sortField('partitionCount') },
            {
                title: 'Replication Factor', width: 150, render: (t, r) => {
                    if (r.activeReassignments.length == 0) return r.replicationFactor;
                    return <TextInfoIcon text={String(r.replicationFactor)} info="While reassignment is active, replication factor is temporarily doubled." maxWidth="180px" />
                },
                sorter: sortField('replicationFactor')
            },
            {
                title: 'Brokers', width: 100, dataIndex: 'partitions',
                render: (value, record) => record.partitions?.map(p => p.leader).distinct().length ?? 'N/A'
            },
            { title: 'Size', width: 100, render: (v, r) => prettyBytesOrNA(r.logDirSummary.totalSizeBytes), sorter: (a, b) => a.logDirSummary.totalSizeBytes - b.logDirSummary.totalSizeBytes },
        ];


        return <>
            <div style={{ margin: '1em 1em 2em 1em' }}>

                {/* Current Selection */}
                <SelectionInfoBar partitionSelection={this.props.partitionSelection} margin="1.5em ​0em 0em 0.3em" />

                {/* Statistics, Quicksearch */}
                <div style={{ margin: '0 1px', marginBottom: '1em', display: 'flex', gap: '2.5em', alignItems: 'flex-end' }}>
                    {/* <Input allowClear={true} placeholder='Quick Search' style={{ width: '250px' }}
                        value={uiSettings.reassignment.quickSearch}
                        onChange={x => uiSettings.reassignment.quickSearch = x.target.value}
                    /> */}
                </div>

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
                        onChange={(p) => {
                            if (p.pageSize) uiSettings.reassignment.pageSizeSelect = p.pageSize;
                            this.pageConfig.current = p.current;
                            this.pageConfig.pageSize = p.pageSize;
                        }}
                        showSorterTooltip={false}

                        dataSource={this.topicPartitions}
                        rowKey={r => r.topicName}
                        rowClassName={'pureDisplayRow'}

                        rowSelection={{
                            type: 'checkbox',
                            columnTitle: <div style={{ display: 'flex' }} >
                                <TextInfoIcon text="" info={<>
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

                                // Select all partitions in this topic
                                transaction(() => {
                                    for (const p of record.partitions)
                                        this.setSelection(record.topicName, p.id, selected);
                                });
                            },
                            onSelectMultiple: (selected, selectedRows, changeRows) => {
                                transaction(() => {
                                    for (const r of changeRows)
                                        for (const p of r.partitions)
                                            this.setSelection(r.topicName, p.id, selected);
                                });
                            },
                        }}
                        columns={columns}
                        expandable={{
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
                        }}
                    />
                </ConfigProvider>
            </div>
        </>
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

        if (selected.length == tp.partitionCount)
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

    render() {
        return <div style={{ paddingTop: '4px', paddingBottom: '8px', width: 0, minWidth: '100%' }}>
            <Table size='small' className='nestedTable'
                dataSource={this.props.topicPartitions}
                pagination={this.partitionsPageConfig}
                scroll={{ y: '300px' }}
                rowKey={r => r.id}
                rowSelection={{
                    type: 'checkbox',
                    columnWidth: '43px',
                    columnTitle: <></>,
                    selectedRowKeys: this.props.getSelectedPartitions().slice(),
                    onSelect: (record, selected: boolean, selectedRows) => {
                        this.props.setSelection(this.props.topic.topicName, record.id, selected);
                    },
                }}
                columns={[
                    { width: 100, title: 'Partition', dataIndex: 'id', sortOrder: 'ascend', sorter: (a, b) => a.id - b.id },
                    {
                        width: undefined, title: 'Brokers', render: (v, record) => <BrokerList brokerIds={record.replicas} leaderId={record.leader} />
                    },
                    {
                        width: 100, title: 'Size', render: (v, p) => prettyBytesOrNA(p.replicaSize),
                        sortOrder: 'ascend', sorter: (a, b) => a.replicaSize - b.replicaSize
                    },
                ]} />
        </div>;
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
