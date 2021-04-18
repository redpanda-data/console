
import { PencilIcon, TrashIcon, XCircleIcon } from '@heroicons/react/solid';
import { TrashIcon as TrashIconOutline, PencilIcon as PencilIconOutline } from '@heroicons/react/outline';
import { Component } from 'react';
import React from 'react';
import { RadioOptionGroup } from '../../../utils/tsxUtils';
import { Modal, Radio, Select } from 'antd';
import { observer } from 'mobx-react';
import { observable } from 'mobx';
import { GroupDescription } from '../../../state/restInterfaces';
import { GroupMembersByTopic } from './Group.Details';

type EditOptions = 'startOffset' | 'endOffset' | 'time' | 'otherGroup';

// props:
// - consumer group
// - topics
//      - partitionIds

@observer
export class EditOffsetsModal extends Component<{
    group: GroupDescription,

    membersByTopic: GroupMembersByTopic | null
    onClose: () => void,
}> {

    lastMembersByTopic: GroupMembersByTopic;

    @observable selectedOption: EditOptions = 'startOffset';

    render() {
        let { group, membersByTopic } = this.props;
        const visible = Boolean(membersByTopic);
        if (membersByTopic) this.lastMembersByTopic = membersByTopic;
        membersByTopic = membersByTopic ?? this.lastMembersByTopic;

        return <Modal
            title={<>Edit offsets for topic <span>"{membersByTopic?.topicName}"</span></>}
            visible={visible}
            closeIcon={<></>} maskClosable={false}
            okText="Review"
            width="700px"

            onCancel={this.props.onClose}
            onOk={this.props.onClose}
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
                        <div>Group ID: {group?.groupId}</div>
                        <div>Members: {membersByTopic?.partitions.map(x => x.assignedMember).distinct().length}</div>
                        {/* <div>{topics?.length} Topics, {topics?.sum(x => x.items.length)} Partition Assignments</div> */}
                    </div>
                </div>
            </div>

            {/* Options */}
            <div style={{ marginTop: '2em' }}>
                <RadioOptionGroup<EditOptions>
                    value={this.selectedOption}
                    onChange={v => this.selectedOption = v}
                    options={[
                        {
                            value: 'startOffset',
                            title: "Start Offset",
                            subTitle: "Set all offsets to the oldest partition's offset.",
                            content: <>
                                <div>rarrarawrw</div>
                            </>
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
            </div>
        </Modal>
    }
}


@observer
export class DeleteOffsetsModal extends Component<{
    group: GroupDescription,
    onClose: () => void,
}> {

    lastMembersByTopic: GroupMembersByTopic;

    render() {

        return <Modal
            title={<>Delete group <span>"owlshop-customers"</span></>}
            visible={false}
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
}


@observer
export class ConfirmationModal extends Component<{
    group: GroupDescription,
    onClose: () => void,
}> {

    lastMembersByTopic: GroupMembersByTopic;

    render() {

        return <Modal
            title={<>Delete group <span>"owlshop-customers"</span></>}
            visible={false}
            closeIcon={<></>} maskClosable={false}
            cancelButtonProps={{ style: { visibility: 'collapse' } }}
            bodyStyle={{ paddingTop: '1em' }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ width: '80px', height: '80px' }}>
                    <XCircleIcon color="#F53649" />
                </span>
                <h2 style={{ color: 'rgba(0, 0, 0, 0.65)' }}>Deleting Consumer Group Failed</h2>
                <p>Server timeout after 15s</p>
            </div>
        </Modal>
    }
}


