
import { PencilIcon, TrashIcon, XCircleIcon } from '@heroicons/react/solid';
import { TrashIcon as TrashIconOutline, PencilIcon as PencilIconOutline } from '@heroicons/react/outline';
import { Component } from 'react';
import React from 'react';
import { findPopupContainer, numberToThousandsString, QuickTable, RadioOptionGroup, InfoText } from '../../../utils/tsxUtils';
import { Button, Collapse, DatePicker, message, Modal, Radio, Select, Table, Tooltip } from 'antd';
import { observer } from 'mobx-react';
import { action, autorun, computed, FlowCancellationError, IReactionDisposer, observable, transaction, untracked } from 'mobx';
import { GroupDescription } from '../../../state/restInterfaces';
import { ChevronLeftIcon, ChevronRightIcon, SkipIcon } from '@primer/octicons-v2-react';
import { animProps_modalPage, animProps_radioOptionGroup, MotionDiv } from '../../../utils/animationProps';
import { AnimatePresence, AnimateSharedLayout, motion } from 'framer-motion';
import ReactCSSTransitionReplace from 'react-css-transition-replace';
import { sortField } from '../../misc/common';
import moment from 'moment';
import { clone } from '../../../utils/jsonUtils';
import { api } from '../../../state/backendApi';

type EditOptions = 'startOffset' | 'endOffset' | 'time' | 'otherGroup';

// props:
// - consumer group
// - topics
//      - partitionIds


export type GroupOffset = {
    topicName: string;
    partitionId: number;

    // Current Offset
    // Can be undefined when we extend our offsets using another group,
    // in that case we don't have a "Current Offset"
    offset?: number;

    newOffset?: number | Date; // start/end/other: number, timestamp: Date
};



@observer
export class EditOffsetsModal extends Component<{
    group: GroupDescription,
    offsets: GroupOffset[] | null,
    onClose: () => void,
}> {
    lastOffsets: GroupOffset[];
    lastVisible = false;
    offsetsByTopic: {
        topicName: string;
        items: GroupOffset[];
    }[] = [];
    autorunDisposer: IReactionDisposer | null = null;

    @observable page: 0 | 1 = 0;
    @observable selectedOption: EditOptions = 'startOffset';
    @observable timestampUtcMs: number = new Date().valueOf();
    @observable otherConsumerGroups: GroupDescription[] = [];
    @observable selectedGroup: string | undefined = undefined;
    @observable otherGroupCopyMode: 'all' | 'onlyExisting' = 'onlyExisting';

    render() {
        let { group, offsets } = this.props;
        const visible = Boolean(offsets);
        this.updateVisible(visible);
        if (offsets) this.lastOffsets = offsets;
        offsets = offsets ?? this.lastOffsets;
        if (!offsets) return null;

        this.offsetsByTopic = offsets.groupInto(x => x.topicName).map(g => ({ topicName: g.key, items: g.items }));
        const single = this.offsetsByTopic.length == 1;

        return <Modal
            title="Edit consumer group"
            visible={visible}
            closeIcon={<></>} maskClosable={false}
            okText="Review"
            width="700px"
            footer={this.footer()}
            centered
            className="consumerGroupModal consumerGroupModal-edit"
        >
            {/* Header */}
            <div style={{ display: 'flex', flexDirection: 'row', gap: '22px' }}>
                <div>
                    <div style={{
                        width: '64px', height: '64px', padding: '14px',
                        marginTop: '4px', marginLeft: '4px',
                        background: '#718096', borderRadius: '1000px',
                    }}>
                        <PencilIconOutline color="white" />
                    </div>
                </div>
                <div>
                    <span>Group offsets will be editted for:</span>

                    <div style={{ fontWeight: 600, margin: '8px 0', lineHeight: '1.5' }}>
                        <div>Group: <span className='codeBox'>{group.groupId}</span></div>
                        <div>
                            {this.offsetsByTopic.length} {single ? 'Topic' : 'Topics'} / {offsets.length} {offsets.length == 1 ? 'Partition' : 'Partitions'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div style={{ marginTop: '2em' }}>
                {this.page == 0
                    ? <div key='p1'>{this.page1()}</div>
                    : <div key='p2'>{this.page2()}</div>
                }
            </div>

        </Modal>
    }

    page1() {

        return <RadioOptionGroup<EditOptions>
            value={this.selectedOption}
            onChange={v => this.selectedOption = v}
            options={[
                {
                    value: 'startOffset',
                    title: "Start Offset",
                    subTitle: "Set all offsets to the oldest partition's offset.",
                },
                {
                    value: 'endOffset',
                    title: "End Offset",
                    subTitle: "Set all offsets to the newest partition's offset.",
                },
                {
                    value: 'time',
                    title: "Specific Time",
                    subTitle: "Choose a timestamp to which all partition's offsets will be set.",
                    content: <div style={{
                        paddingTop: '6px',
                        marginLeft: '-1px',
                    }}>
                        <GroupTimePicker valueUtcMs={this.timestampUtcMs} onChange={t => this.timestampUtcMs = t} />
                    </div>
                },
                {
                    value: 'otherGroup',
                    title: "Other Consumer Group",
                    subTitle: "Copy offsets from another (inactive) consumer group",
                    content: <>
                        <div style={{
                            display: 'flex', gap: '.5em', flexDirection: 'column',
                            paddingTop: '12px', marginLeft: '-1px'
                        }}>
                            <Select style={{ minWidth: '260px' }}
                                placeholder="Select another consumer group..."
                                showSearch
                                options={this.otherConsumerGroups.map(g => ({ value: g.groupId, label: g.groupId, title: g.groupId, }))}
                                value={this.selectedGroup}
                                onChange={x => this.selectedGroup = x}
                            />

                            <Radio.Group defaultValue='onlyExisting' style={{
                                display: 'flex', flexDirection: 'column', gap: '4px',
                                padding: '1px 8px 1px 4px',
                            }}
                                value={this.otherGroupCopyMode}
                                onChange={x => this.otherGroupCopyMode = x.target.value}
                            >
                                <Radio value='onlyExisting'>
                                    <span style={{ display: 'inline-flex', gap: '0.5em' }}>
                                        <span>Copy matching offsets</span>
                                        <InfoText tooltip="Will only lookup the offsets for the topics/partitions that are defined in this group. If the other group has offsets for some additional topics/partitions they will be ignored." maxWidth="450px" />
                                    </span>
                                </Radio>
                                <Radio value='all'>
                                    <span style={{ display: 'inline-flex', gap: '0.5em' }}>
                                        <span>Full copy</span>
                                        <InfoText tooltip="If the selected group has offsets for some topics/partitions that don't exist in the current consumer group, they will be copied anyway." maxWidth="450px" />
                                    </span>
                                </Radio>
                            </Radio.Group>
                        </div>
                    </>
                },
            ]}
        />
    }

    page2() {
        const firstTopic = this.offsetsByTopic[0].topicName;

        return <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <Collapse bordered={false} defaultActiveKey={firstTopic}>
                {this.offsetsByTopic.map(({ topicName, items }) =>

                    <Collapse.Panel key={topicName}
                        style={{ padding: 0 }}
                        header={
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '4px',
                                fontWeight: 600, whiteSpace: 'nowrap'
                            }}>
                                {/* Title */}
                                <span style={{
                                    textOverflow: 'ellipsis',
                                    overflow: 'hidden',
                                    paddingRight: '30px',
                                }}>{topicName}</span>
                                <span style={{ display: 'inline-block', marginLeft: 'auto', padding: '0 1em', }}>{items.length} Partitions</span>
                            </div>
                        }>

                        <Table
                            size='small'
                            showSorterTooltip={false}
                            pagination={{ pageSize: 1000, position: ['none', 'none'] as any }}

                            dataSource={items}
                            rowKey={r => r.partitionId}
                            rowClassName={(r) => r.newOffset == null ? 'unchanged' : ''}
                            columns={[
                                { width: 130, title: 'Partition', dataIndex: 'partitionId', sorter: sortField('partitionId'), sortOrder: 'ascend' },
                                {
                                    width: 150, title: 'Offset Before', dataIndex: 'offset',
                                    render: v => v == null
                                        ? <Tooltip
                                            title="The group does not have an offset for this partition yet"
                                            mouseEnterDelay={0.1} getPopupContainer={findPopupContainer}
                                        >
                                            <span style={{ opacity: 0.66, marginLeft: '2px' }}><SkipIcon /></span>
                                        </Tooltip>
                                        : numberToThousandsString(v)
                                },
                                {
                                    title: 'Offset After',
                                    render: (_, r) => {
                                        const v = r.newOffset;
                                        if (v == null)
                                            return <Tooltip
                                                title="Offset will not be changed"
                                                mouseEnterDelay={0.1}
                                                getPopupContainer={findPopupContainer}
                                            >
                                                <span style={{ opacity: 0.66, marginLeft: '2px' }}><SkipIcon /></span>
                                            </Tooltip>

                                        if (typeof v === 'number')
                                            return v < 0
                                                ? (v == -1 ? 'Latest' : 'Earliest')
                                                : numberToThousandsString(v);

                                        if (v instanceof Date)
                                            return v.toLocaleString();

                                        return v;
                                    },
                                }
                            ]}
                        />

                    </Collapse.Panel>
                )}
            </Collapse>
        </div>
    }

    @action
    setPage(page: 0 | 1) {
        if (page == 1) {
            // compute and set newOffset
            if (this.props.offsets == null) return;
            const op = this.selectedOption;

            if (op == 'startOffset') {
                // Earliest
                this.props.offsets.forEach(x => x.newOffset = -2);
            } else if (op == 'endOffset') {
                // Latest
                this.props.offsets.forEach(x => x.newOffset = -1);
            } else if (op == 'time') {
                // Time
                this.props.offsets.forEach(x => x.newOffset = new Date(this.timestampUtcMs));
            } else {
                // Other group
                // Lookup offsets from the other group
                const other = api.consumerGroups.get(this.selectedGroup ?? '');
                if (other) {

                    // Helper functions
                    const getOffset = function (topicName: string, partitionId: number): number | undefined {
                        return other.topicOffsets
                            .first(t => t.topic == topicName)?.partitionOffsets
                            .first(p => p.partitionId == partitionId)?.groupOffset;
                    }

                    const currentOffsets = this.props.offsets;
                    const alreadyExists = function (topicName: string, partitionId: number): boolean {
                        return currentOffsets.any(x => x.topicName == topicName && x.partitionId == partitionId);
                    }

                    //
                    // Copy offsets that exist in the current group from the other group
                    for (const x of this.props.offsets)
                        x.newOffset = getOffset(x.topicName, x.partitionId);

                    //
                    // Extend our offsets with any offsets that our group currently doesn't have
                    if (this.otherGroupCopyMode == 'all') {

                        const otherFlat = other.topicOffsets.flatMap(x => x.partitionOffsets.flatMap(p => ({
                            topicName: x.topic,
                            partitionId: p.partitionId,
                            offset: p.groupOffset,
                        })));

                        for (const o of otherFlat)
                            if (!alreadyExists(o.topicName, o.partitionId))
                                currentOffsets.push({
                                    topicName: o.topicName,
                                    partitionId: o.partitionId,
                                    offset: undefined,
                                    newOffset: o.offset,
                                });
                    }
                }
                else {
                    message.error(`Could not find other consumer group "${this.selectedGroup}" to compute new offsets`);
                }
            }

            for (const x of this.props.offsets) {


            }
        }

        this.page = page;
    }

    footer() {
        if (this.page == 0) return <div>
            <Button key='cancel' onClick={this.props.onClose}>Cancel</Button>

            <Button key='next' type='primary' onClick={() => this.setPage(1)}>
                <span>Review</span>
                <span><ChevronRightIcon /></span>
            </Button>
        </div>
        else return <div style={{ display: 'flex' }}>
            <Button key='back' onClick={() => this.setPage(0)} style={{ paddingRight: '18px' }}>
                <span><ChevronLeftIcon /></span>
                <span>Back</span>
            </Button>

            <Button key='cancel'
                style={{ marginLeft: 'auto' }}
                onClick={this.props.onClose}
            >Cancel</Button>

            <Button key='next' type='primary'>
                <span>Apply</span>
            </Button>
        </div>
    }

    updateVisible(visible: boolean) {
        if (visible == this.lastVisible) return;

        if (visible) {
            setImmediate(() => {
                // modal became visible

                // need all groups to compute other groups
                api.refreshConsumerGroups();

                this.autorunDisposer = autorun(() => {
                    this.otherConsumerGroups = [...api.consumerGroups.values()]
                        .filter(g => g.groupId != this.props.group.groupId);
                });

                // reset settings
                transaction(() => {
                    this.setPage(0);
                    this.selectedOption = 'startOffset';
                });
            });

        }
        else {
            if (this.autorunDisposer) {
                this.autorunDisposer();
                this.autorunDisposer = null;
            }
        }

        this.lastVisible = visible;
    }
}

@observer
class GroupTimePicker extends Component<{
    valueUtcMs: number,
    onChange: (utcMs: number) => void,
}> {

    @observable isLocalTimeMode = false;
    @observable timestampUtcMs: number = new Date().valueOf();

    constructor(p: any) {
        super(p);
        this.timestampUtcMs = this.props.valueUtcMs;
    }

    render() {
        let format = "DD.MM.YYYY HH:mm:ss";
        let current: moment.Moment = moment.utc(this.timestampUtcMs);

        if (this.isLocalTimeMode) {
            current = current?.local();
            format += " [(Local)]";
        } else {
            format += " [(UTC)]";
        }

        return <DatePicker showTime={true} allowClear={false}
            renderExtraFooter={() => this.footer()}
            format={format}
            value={current}
            onChange={e => {
                this.timestampUtcMs = e?.valueOf() ?? -1;
                this.props.onChange(this.timestampUtcMs);
            }}
            onOk={e => {
                this.timestampUtcMs = e.valueOf();
                this.props.onChange(this.timestampUtcMs);
            }}
        />
    }

    footer() {
        return <Radio.Group
            value={this.isLocalTimeMode ? 'local' : 'utc'}
            onChange={e => {
                // console.log("date mode changed", { newValue: e.target.value, isLocalMode: this.isLocalTimeMode });
                this.isLocalTimeMode = e.target.value == 'local';
            }}>
            <Radio value='local'>Local</Radio>
            <Radio value='utc'>UTC</Radio>
        </Radio.Group>
    }
}


@observer
export class DeleteOffsetsModal extends Component<{
    group: GroupDescription,
    offsets: GroupOffset[] | null,
    onClose: () => void,
}> {

    lastOffsets: GroupOffset[];

    render() {
        let { group, offsets } = this.props;
        const visible = Boolean(offsets);
        if (offsets) this.lastOffsets = offsets;
        offsets = offsets ?? this.lastOffsets;


        return <Modal
            title="Delete consumer group offsets"
            visible={visible}
            closeIcon={<></>} maskClosable={false}
            okText="Yes"
            okButtonProps={{ danger: true }}
            cancelText="No"
        >
            <div style={{ display: 'flex', flexDirection: 'row', gap: '2em' }}>
                <div>
                    <div style={{ width: '64px', height: '64px', padding: '12px', background: '#F53649', borderRadius: '1000px' }}>
                        <TrashIconOutline color="white" />
                    </div>
                </div>
                <div>
                    <p>Are you sure you want to delete all group offsets for the following consumer groups?</p>
                    <div>
                        <span>Group offsets will be deleted for:</span>
                        <ul style={{ fontWeight: 600 }}>
                            <li>owlshop-customers / 12 partitions</li>
                        </ul>
                    </div>
                </div>

            </div>
        </Modal>
    }

    async onDeleteOffsets() {
        // const response = await api.editConsumerGroupOffsets(this.props.group.groupId, [{
        //     topicName: g.topicName,
        //     partitions: g.partitions.map(p => ({
        //         partitionId: p.partitionId,
        //         offset: 0,
        //     }))
        // }]);

        // // need to refresh consumer groups after changing something
        // api.refreshConsumerGroup(this.props.group.groupId, true);

        // console.log('editConsumerGroupOffsets', { response: response });
    }
}



