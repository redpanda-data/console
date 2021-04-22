
import { PencilIcon, TrashIcon, XCircleIcon } from '@heroicons/react/solid';
import { TrashIcon as TrashIconOutline, PencilIcon as PencilIconOutline } from '@heroicons/react/outline';
import { Component } from 'react';
import React from 'react';
import { findPopupContainer, QuickTable, RadioOptionGroup } from '../../../utils/tsxUtils';
import { Button, Modal, Radio, Select } from 'antd';
import { observer } from 'mobx-react';
import { FlowCancellationError, observable } from 'mobx';
import { GroupDescription } from '../../../state/restInterfaces';
import { ChevronLeftIcon, ChevronRightIcon } from '@primer/octicons-v2-react';
import { animProps_modalPage, animProps_radioOptionGroup, MotionDiv } from '../../../utils/animationProps';
import { AnimatePresence, AnimateSharedLayout, motion } from 'framer-motion';
import ReactCSSTransitionReplace from 'react-css-transition-replace';

type EditOptions = 'startOffset' | 'endOffset' | 'time' | 'otherGroup';

// props:
// - consumer group
// - topics
//      - partitionIds


export type GroupOffset = {
    topicName: string;
    partitionId: number;
    offset: number; // offset of the group for this partition
};



@observer
export class EditOffsetsModal extends Component<{
    group: GroupDescription,
    offsets: GroupOffset[] | null,
    onClose: () => void,
}> {
    lastOffsets: GroupOffset[];

    @observable selectedOption: EditOptions = 'startOffset';
    @observable page: 0 | 1 = 0;

    render() {
        let { group, offsets } = this.props;
        const visible = Boolean(offsets);
        if (offsets) this.lastOffsets = offsets;
        offsets = offsets ?? this.lastOffsets;
        if (!offsets) return null;

        const offsetsByTopic = offsets.groupInto(x => x.topicName).map(g => ({ topicName: g.key, items: g.items }));
        const single = offsetsByTopic.length == 1;

        return <Modal
            title="Edit consumer group"
            visible={visible}
            closeIcon={<></>} maskClosable={false}
            okText="Review"
            width="700px"
            footer={this.footer()}
            centered
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
                            {offsetsByTopic.length} {single ? 'Topic' : 'Topics'} / {offsets.length} {offsets.length == 1 ? 'Partition' : 'Partitions'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div style={{ marginTop: '2em' }}>
                {this.page == 0
                    ? <div key='p1' style={{ width: 'auto' }}>{this.page1()}</div>
                    : <div key='p2' style={{ width: 'auto' }}>{this.page2()}</div>
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
                    content: <>
                        <div>TIME CONTROL HERE</div>
                    </>
                },
                {
                    value: 'otherGroup',
                    title: "Other Consumer Group",
                    subTitle: "Copy offsets from another (inactive) consumer group",
                    content: <>
                        <Select options={[
                            { value: 'a', title: 'title a', label: 'label a' },
                            { value: 'b', title: 'title b', label: 'label b' },
                            { value: 'c', title: 'title c', label: 'label c' },
                        ]} />
                        <Radio.Group defaultValue='onlyExisting'>
                            <Radio value='all'>Copy all offsets</Radio>
                            <Radio value='onlyExisting'>Copy only existing offsets</Radio>
                        </Radio.Group>
                    </>
                },
            ]}
        />
    }

    page2() {
        return <div>
            no content here yet :P
        </div>
    }

    footer() {
        if (this.page == 0) return <div>
            <Button key='cancel' onClick={this.props.onClose}>Cancel</Button>

            <Button key='next' type='primary' onClick={() => this.page = 1}>
                <span>Review</span>
                <span><ChevronRightIcon /></span>
            </Button>
        </div>
        else return <div style={{ display: 'flex' }}>
            <Button key='back' onClick={() => this.page = 0}>
                <span><ChevronLeftIcon /></span>
                <span>Back</span>
            </Button>

            <Button key='cancel'
                style={{ marginLeft: 'auto' }}
                onClick={this.props.onClose}
            >Cancel</Button>

            <Button key='next' type='primary'>
                <span>Review</span>
                <span><ChevronRightIcon /></span>
            </Button>
        </div>
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



