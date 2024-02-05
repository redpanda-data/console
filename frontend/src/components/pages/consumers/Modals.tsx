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


import { PencilIcon as PencilIconOutline, TrashIcon as TrashIconOutline } from '@heroicons/react/outline';
import { Component } from 'react';
import { InfoText, numberToThousandsString, RadioOptionGroup } from '../../../utils/tsxUtils';
import { observer } from 'mobx-react';
import { action, autorun, IReactionDisposer, makeObservable, observable, transaction } from 'mobx';
import { DeleteConsumerGroupOffsetsTopic, EditConsumerGroupOffsetsTopic, GroupDescription, PartitionOffset, TopicOffset } from '../../../state/restInterfaces';
import { toJson } from '../../../utils/jsonUtils';
import { api } from '../../../state/backendApi';
import { WarningOutlined } from '@ant-design/icons';
import { showErrorModal } from '../../misc/ErrorModal';
import { appGlobal } from '../../../state/appGlobal';
import { KowlTimePicker } from '../../misc/KowlTimePicker';
import { ChevronLeftIcon, ChevronRightIcon, SkipIcon } from '@primer/octicons-react';
import { Accordion, Box, Button, createStandaloneToast, DataTable, Flex, HStack, List, ListItem, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Popover, Radio, redpandaTheme, redpandaToastOptions, Text, Tooltip, UnorderedList } from '@redpanda-data/ui';
import { SingleSelect } from '../../misc/Select';

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

    // start/end/other:
    // undefined  =>
    // number     => concrete offset from other consumer group
    // Date       => placeholder for 'specific time' until real offsets are loaded
    // PartitionOffset => real offsets for Date
    newOffset?: number | Date | PartitionOffset;
};

const { ToastContainer, toast } = createStandaloneToast({
    theme: redpandaTheme,
    defaultOptions: {
        ...redpandaToastOptions.defaultOptions,
        isClosable: false,
        duration: 2000
    }
})

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

    @observable isLoadingTimestamps = false;
    @observable isApplyingEdit = false;

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    render() {
        let offsets = this.props.offsets;
        const group = this.props.group;

        const visible = Boolean(offsets);
        this.updateVisible(visible);
        if (offsets) this.lastOffsets = offsets;
        offsets = offsets ?? this.lastOffsets;
        if (!offsets) return null;

        this.offsetsByTopic = offsets.groupInto(x => x.topicName).map(g => ({topicName: g.key, items: g.items}));
        const single = this.offsetsByTopic.length == 1;

        return (
            <>
                <ToastContainer />
                <Modal isOpen={visible} onClose={() => {
                }}>
                    <ModalOverlay/>
                    <ModalContent minW="5xl">
                        <ModalHeader>Edit consumer group</ModalHeader>
                        <ModalBody>
                            <HStack spacing={6}>
                                <div>
                                    <div
                                        style={{
                                            width: '64px',
                                            height: '64px',
                                            padding: '14px',
                                            marginTop: '4px',
                                            marginLeft: '4px',
                                            background: '#718096',
                                            borderRadius: '1000px'
                                        }}
                                    >
                                        <PencilIconOutline color="white"/>
                                    </div>
                                </div>
                                <div>
                                    <span>Group offsets will be editted for:</span>

                                    <div style={{fontWeight: 600, margin: '8px 0', lineHeight: '1.5'}}>
                                        <div>
                                            Group: <span className="codeBox">{group.groupId}</span>
                                        </div>
                                        <div>
                                            {this.offsetsByTopic.length} {single ? 'Topic' : 'Topics'} / {offsets.length} {offsets.length == 1 ? 'Partition' : 'Partitions'}
                                        </div>
                                    </div>
                                </div>
                            </HStack>

                            {/* Content */}
                            <div style={{marginTop: '2em'}}>{this.page == 0 ? <div key="p1">{this.page1()}</div> : <div key="p2">{this.page2()}</div>}</div>
                        </ModalBody>
                        <ModalFooter gap={2}>{this.footer()}</ModalFooter>
                    </ModalContent>
                </Modal>
            </>
        )
    }

    page1() {
        return (
            <RadioOptionGroup<EditOptions>
                disabled={this.isLoadingTimestamps}
                value={this.selectedOption}
                onChange={v => (this.selectedOption = v)}
                options={[
                    {
                        value: 'startOffset',
                        title: 'Start Offset',
                        subTitle: 'Set all offsets to the oldest partition\'s offset.'
                    },
                    {
                        value: 'endOffset',
                        title: 'End Offset',
                        subTitle: 'Set all offsets to the newest partition\'s offset.'
                    },
                    {
                        value: 'time',
                        title: 'Specific Time',
                        subTitle: 'Choose a timestamp to which all partition\'s offsets will be set.',
                        content: (
                            <div
                                style={{
                                    paddingTop: '6px',
                                    marginLeft: '-1px'
                                }}
                            >
                                <KowlTimePicker valueUtcMs={this.timestampUtcMs} onChange={t => (this.timestampUtcMs = t)} disabled={this.isLoadingTimestamps}/>
                            </div>
                        )
                    },
                    {
                        value: 'otherGroup',
                        title: 'Other Consumer Group',
                        subTitle: 'Copy offsets from another (inactive) consumer group',
                        content: (
                            <>
                                <div
                                    // Workaround for Ant Design Issue: https://github.com/ant-design/ant-design/issues/25959
                                    // fixes immediately self closing Select drop down after an option has already been selected
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                    }}
                                    style={{
                                        display: 'flex',
                                        gap: '.5em',
                                        flexDirection: 'column',
                                        paddingTop: '12px',
                                        marginLeft: '-1px',
                                    }}
                                >
                                    <SingleSelect
                                        options={this.otherConsumerGroups.map(g => ({value: g.groupId, label: g.groupId}))}
                                        value={this.selectedGroup}
                                        onChange={x => (this.selectedGroup = x)}
                                        isDisabled={this.isLoadingTimestamps}
                                    />

                                    <Radio value="onlyExisting" isChecked={this.otherGroupCopyMode === 'onlyExisting'} onClick={() => {
                                        this.otherGroupCopyMode = 'onlyExisting'
                                    }}>
                                        <InfoText tooltip="Will only lookup the offsets for the topics/partitions that are defined in this group. If the other group has offsets for some additional topics/partitions they will be ignored." maxWidth="450px">
                                            Copy matching offsets
                                        </InfoText>
                                    </Radio>

                                    <Radio value="all" isChecked={this.otherGroupCopyMode === 'all'} onClick={() => {
                                        this.otherGroupCopyMode = 'all'
                                    }}>
                                        <InfoText tooltip="If the selected group has offsets for some topics/partitions that don't exist in the current consumer group, they will be copied anyway." maxWidth="450px">
                                            Full Copy
                                        </InfoText>
                                    </Radio>
                                </div>
                            </>
                        )
                    }
                ]}
            />
        );
    }

    page2() {
        return (
            <div style={{maxHeight: '400px', overflowY: 'auto'}}>
                <Accordion defaultIndex={0} items={this.offsetsByTopic.map(({topicName, items}) => ({
                    heading: <Flex
                        alignItems="center"
                        gap={1}
                        fontWeight={600}
                        whiteSpace="nowrap"
                    >
                        {/* Title */}
                        <Text
                            textOverflow="ellipsis"
                            overflow="hidden"
                            pr={8}
                        >
                            {topicName}
                        </Text>
                        <Text display="inline-block" ml="auto" padding="0 1rem">{items.length} Partitions</Text>
                    </Flex>,
                    description: <DataTable<GroupOffset>
                        size="sm"
                        pagination
                        defaultPageSize={100}
                        sorting
                        data={items}
                        columns={[
                            {
                                size: 130,
                                header: 'Partition',
                                accessorKey: 'partitionId',
                            },
                            {
                                size: 150,
                                header: 'Offset Before',
                                accessorKey: 'offset',
                                cell: ({row: {original: {offset}}}) =>
                                    offset == null ? (
                                        <Tooltip label="The group does not have an offset for this partition yet" openDelay={1} placement="top" hasArrow>
                                                    <span style={{opacity: 0.66, marginLeft: '2px'}}>
                                                        <SkipIcon/>
                                                    </span>
                                        </Tooltip>
                                    ) : (
                                        numberToThousandsString(offset)
                                    )
                            },
                            {
                                header: 'Offset After',
                                id: 'offsetAfter',
                                size: Infinity,
                                cell: ({row: {original}}) => <ColAfter selectedTime={this.timestampUtcMs} record={original}/>
                            }
                        ]}
                    />,
                }))}/>
            </div>
        );
    }

    differWarning() {
        const content = <div>
            <p>The offsets that actually get applied may be different from what is shown in this column.</p>
            <h6>Example</h6>
            <p>
                If you chose to change all group offsets to 'End Offset', the offsets for each topic (high/low watermarks) are fetched.
                But when your change request reaches the backend, those offsets might have changed already because new messages were written to the topic.
                The backend will correct for this difference and apply the correct offset.
            </p>
        </div>;

        return <Popover trigger="click" content={content} size="auto" hideCloseButton>
            <WarningOutlined/>
        </Popover>;
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
                // this.props.offsets.forEach(x => x.newOffset = new Date(this.timestampUtcMs));
                this.props.offsets.forEach(x => x.newOffset = 'fetching offsets...' as any);
                const requiredTopics = this.props.offsets.map(x => x.topicName).distinct();

                const propOffsets = this.props.offsets;
                // Fetch offset for each partition
                setTimeout(async () => {
                    const toastMsg = 'Fetching offsets for timestamp'
                    const toastRef = toast({
                        status: 'loading',
                        description: `${toastMsg}...`,
                        duration: null
                    })

                    let offsetsForTimestamp: TopicOffset[];
                    try {
                        offsetsForTimestamp = await api.getTopicOffsetsByTimestamp(requiredTopics, this.timestampUtcMs);
                        toast.update(toastRef, {
                            status: 'success',
                            duration: 2000,
                            description: `${toastMsg} - done`
                        })
                    } catch (err) {
                        showErrorModal(
                            'Failed to fetch offsets for timestamp',
                            <span>Could not lookup offsets for given timestamp <span className="codeBox">{new Date(this.timestampUtcMs).toUTCString()}</span>.</span>,
                            toJson({errors: err, request: requiredTopics}, 4)
                        );
                        toast.update(toastRef, {
                            status: 'error',
                            duration: 2000,
                            description: `${toastMsg} - failed`
                        })
                        return;
                    }

                    propOffsets.forEach(x => {
                        const responseOffset = offsetsForTimestamp.first(t => t.topicName == x.topicName)?.partitions.first(p => p.partitionId == x.partitionId);
                        x.newOffset = responseOffset;
                    });
                });
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
                    };

                    const currentOffsets = this.props.offsets;
                    const alreadyExists = function (topicName: string, partitionId: number): boolean {
                        return currentOffsets.any(x => x.topicName == topicName && x.partitionId == partitionId);
                    };

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
                } else {
                    showErrorModal(
                        'Consumer group not found',
                        null,
                        <span>Could not find a consumer group named <span className="codeBox">{this.selectedGroup}</span> to compute new offsets.</span>,
                    );
                }
            }
        }

        this.page = page;
    }

    footer() {
        const disableContinue = this.selectedOption == 'otherGroup' && !this.selectedGroup;
        const disableNav = this.isApplyingEdit || this.isLoadingTimestamps;

        if (this.page == 0) return <Flex gap={2}>
            <Button key="cancel" onClick={this.props.onClose}>Cancel</Button>

            <Button key="next" variant="solid" onClick={() => this.setPage(1)}
                    isDisabled={disableContinue || disableNav}
                    isLoading={this.isLoadingTimestamps}
            >
                <span>Review</span>
                <span><ChevronRightIcon/></span>
            </Button>
        </Flex>;
        else return <Flex gap={2}>
            <Button key="back" onClick={() => this.setPage(0)} style={{paddingRight: '18px'}}
                    isDisabled={disableNav}
            >
                <span><ChevronLeftIcon/></span>
                <span>Back</span>
            </Button>

            <Button key="cancel"
                    style={{marginLeft: 'auto'}}
                    onClick={this.props.onClose}
            >Cancel</Button>

            <Button key="next" variant="solid" isDisabled={disableNav}
                    onClick={() => this.onApplyEdit()}
            >
                <span>Apply</span>
            </Button>
        </Flex>;
    }

    updateVisible(visible: boolean) {
        if (visible == this.lastVisible) return;

        if (visible) {
            setTimeout(() => {
                // modal became visible

                // need all groups for "other groups" dropdown
                api.refreshConsumerGroups();

                // need watermarks for all topics the group consumes
                // in order to know earliest/latest offsets
                const topics = this.props.group.topicOffsets.map(x => x.topic).distinct();
                api.refreshPartitions(topics, true);


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

        } else {
            if (this.autorunDisposer) {
                this.autorunDisposer();
                this.autorunDisposer = null;
            }
        }

        this.lastVisible = visible;
    }


    @action
    async onApplyEdit() {
        const group = this.props.group;
        const offsets = this.props.offsets!;

        this.isApplyingEdit = true;
        const toastMsg = 'Applying offsets'
        const toastRef = toast({
            status: 'loading',
            description: `${toastMsg}...`,
            duration: null
        })
        const topics = createEditRequest(offsets);
        try {
            const editResponse = await api.editConsumerGroupOffsets(group.groupId, topics);
            const errors = editResponse.map(t => ({
                ...t,
                partitions: t.partitions.filter(x => x.error),
            })).filter(t => t.partitions.length > 0);
            if (errors.length > 0) {
                console.error('apply offsets, backend errors', {errors: errors, request: topics});
                // eslint-disable-next-line no-throw-literal
                throw {errors: errors, request: topics};
            }

            toast.update(toastRef, {
                status: 'success',
                duration: 2000,
                description: `${toastMsg} - done`
            })
        } catch (err) {
            console.error('failed to apply offset edit', err);
            toast.update(toastRef, {
                status: 'error',
                duration: 2000,
                description: `${toastMsg} - failed`
            })
            showErrorModal(
                'Apply editted offsets',
                <span>
                    Could not apply offsets for consumer
                    group <span className="codeBox">{group.groupId}</span>.
                </span>,
                toJson(err, 4),
            );
        } finally {
            this.isApplyingEdit = false;
            api.refreshConsumerGroup(this.props.group.groupId, true);
            this.props.onClose();
        }
    }
}

@observer
class ColAfter extends Component<{
    selectedTime?: number
    record: GroupOffset
}> {

    render() {
        const record = this.props.record;
        const val = record.newOffset;

        // No change
        if (val == null) {
            return (
                <Tooltip label="Offset will not be changed" openDelay={1} placement="top" hasArrow>
                    <span style={{opacity: 0.66, marginLeft: '2px'}}>
                        <SkipIcon/>
                    </span>
                </Tooltip>
            );
        }

        // Set by timestamp
        if (typeof val == 'object') {
            // placeholder while loading
            if (val instanceof Date)
                return val.toLocaleString();

            // actual offset
            if ('offset' in val) {

                // error
                if (val.error) return <span style={{color: 'orangered'}}>
                    {val.error}
                </span>;

                // successful fetch
                if (val.timestamp > 0)
                    return <div style={{display: 'inline-flex', gap: '6px', alignItems: 'center'}}>
                        <span>{numberToThousandsString(val.offset)}</span>
                        <span style={{fontSize: 'smaller', color: 'hsl(0deg 0% 67%)', userSelect: 'none', cursor: 'default'}}
                        >({new Date(val.timestamp).toLocaleString()})</span>
                    </div>;

                // not found - no message after given timestamp
                // use 'latest'
                const partition = api.topicPartitions.get(record.topicName)?.first(p => p.id == record.partitionId);
                return (
                    <div style={{display: 'inline-flex', gap: '6px', alignItems: 'center'}}>
                        <InfoText
                            tooltip={
                                <div>
                                    There is no offset for this partition at or after the given timestamp (<code>{new Date(this.props.selectedTime ?? 0).toLocaleString()}</code>). As a fallback, the last offset in that partition will be used.
                                </div>
                            }
                            icon={<WarningOutlined/>}
                            iconSize="18px"
                            iconColor="orangered"
                            maxWidth="350px"
                        >
                            <span>{numberToThousandsString(partition?.waterMarkHigh ?? -1)}</span>
                        </InfoText>
                    </div>
                );
            }
        }


        // Earliest / Latest / OtherGroup
        if (typeof val === 'number') {
            // copied from other group
            if (val >= 0) return numberToThousandsString(val);

            // Get offset from current partition values
            const partition = api.topicPartitions.get(record.topicName)?.first(p => p.id == record.partitionId);

            const content = (val == -2)
                ? {name: 'Earliest', offset: partition?.waterMarkLow ?? '...'}
                : {name: 'Latest', offset: partition?.waterMarkHigh ?? '...'};

            return <div style={{display: 'inline-flex', gap: '6px', alignItems: 'center'}}>
                <span>{typeof content.offset == 'number' ? numberToThousandsString(content.offset) : content.offset}</span>
                <span style={{fontSize: 'smaller', color: 'hsl(0deg 0% 67%)', userSelect: 'none', cursor: 'default'}}>({content.name})</span>
            </div>;
        }

        // Loading placeholder
        if (typeof val === 'string') {
            return <span style={{opacity: 0.66, fontStyle: 'italic'}}>{val}</span>;
        }

        return `Unknown type in 'newOffset' type='${typeof val}' value='{v}'`;
    }
}


export type GroupDeletingMode = 'group' | 'topic' | 'partition';
// Why do we pass 'mode'?
//   It is the users "intent" (where he clicked).
//   Without it, we'd have to infer it, which is possible, but will result in strange wording.
//   For example:
//     - user is viewing a group that has offsets for only one topic
//     - user clicks 'delete' on the topic
//     - dialog would show "you want to delete ALL offsets for this group"
//       which is technically correct, but might give the impression of deleting more than he wanted
@observer
export class DeleteOffsetsModal extends Component<{
    group: GroupDescription,
    mode: GroupDeletingMode,
    offsets: GroupOffset[] | null,
    onClose: () => void,
}> {

    lastOffsets: GroupOffset[];

    render() {
        const {group, mode} = this.props;
        let offsets = this.props.offsets;

        const visible = Boolean(offsets);
        if (offsets) this.lastOffsets = offsets;
        offsets = offsets ?? this.lastOffsets;
        if (!offsets) return null;

        const offsetsByTopic = offsets.groupInto(x => x.topicName).map(g => ({topicName: g.key, items: g.items}));
        const singleTopic = offsetsByTopic.length == 1;
        const singlePartition = offsets.length == 1;

        return (
            <Modal isOpen={visible} onClose={this.props.onClose}>
                <ModalOverlay/>
                <ModalContent minW="5xl">
                    <ModalHeader>{mode == 'group'
                        ? 'Delete consumer group'
                        : 'Delete consumer group offsets'
                    }</ModalHeader>
                    <ModalBody>
                        <Flex flexDirection="row" gap={6}>
                            <div>
                                <div style={{
                                    width: '64px', height: '64px', padding: '12px', marginTop: '4px',
                                    background: '#F53649', borderRadius: '1000px'
                                }}>
                                    <TrashIconOutline color="white"/>
                                </div>
                            </div>
                            <Box>
                                <Box>
                                    <Text>Are you sure you want to delete offsets from this consumer group?</Text>
                                    <Box fontWeight="600" mt={1} mb={6}>
                                        <Text>Group: <span className="codeBox">{group.groupId}</span></Text>
                                    </Box>
                                </Box>

                                <Box>
                                    {mode === 'group' && (
                                        <Box>
                                            <Text>Group offsets will be deleted for all topics and partitions:</Text>
                                            <UnorderedList fontWeight="600" my={2}>
                                                {singleTopic ? (
                                                    <>
                                                        <ListItem>Topic: <span className="codeBox">{offsetsByTopic[0].topicName}</span></ListItem>
                                                        <ListItem>{offsets.length} {singlePartition ? 'Partition' : 'Partitions'}</ListItem>
                                                    </>
                                                ) : (
                                                    <>
                                                        <ListItem>{offsetsByTopic.length} Topics / {offsets.length} {singlePartition ? 'partition' : 'partitions'}</ListItem>
                                                    </>
                                                )}
                                            </UnorderedList>
                                        </Box>
                                    )}

                                    {mode === 'topic' && (
                                        <Box>
                                            <Text>Group offsets will be deleted for topic:</Text>
                                            <List fontWeight="600" my={2}>
                                                <ListItem>Topic: <span className="codeBox">{offsetsByTopic[0].topicName}</span></ListItem>
                                                <ListItem>{offsets.length} {singlePartition ? 'Partition' : 'Partitions'}</ListItem>
                                            </List>
                                        </Box>
                                    )}

                                    {mode === 'partition' && (
                                        <Box>
                                            <Text>Group offsets will be deleted for partition:</Text>
                                            <UnorderedList fontWeight="600" my={2}>
                                                <ListItem>Topic: <span className="codeBox">{offsetsByTopic[0].topicName}</span></ListItem>
                                                <ListItem>Partition: <span className="codeBox">{offsetsByTopic[0].items[0].partitionId}</span></ListItem>
                                            </UnorderedList>
                                        </Box>
                                    )}
                                </Box>
                            </Box>
                        </Flex>
                    </ModalBody>
                    <ModalFooter gap={2}>
                        <Button onClick={() => this.onDeleteOffsets()} colorScheme="red">Delete</Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        )
    }


    @action
    async onDeleteOffsets() {
        const group = this.props.group;
        const offsets = this.props.offsets!;

        const toastMsg = 'Deleting offsets'
        const toastRef = toast({
            status: 'loading',
            description: `${toastMsg}...`,
            duration: null
        })
        try {
            if (this.props.mode === 'group') {
                await api.deleteConsumerGroup(group.groupId);
            } else {
                const deleteRequest = createDeleteRequest(offsets);
                const deleteResponse = await api.deleteConsumerGroupOffsets(group.groupId, deleteRequest);
                const errors = deleteResponse.map(t => ({
                    ...t,
                    partitions: t.partitions.filter(x => x.error),
                })).filter(t => t.partitions.length > 0);
                if (errors.length > 0) {
                    console.error('backend returned errors for deleteOffsets', {request: deleteRequest, errors: errors});
                    // eslint-disable-next-line no-throw-literal
                    throw {request: deleteRequest, errors: errors};
                }
            }

            toast.update(toastRef, {
                status: 'success',
                duration: 2000,
                description: `${toastMsg} - done`
            })
        } catch (err) {
            console.error(err);
            toast.update(toastRef, {
                status: 'error',
                duration: 2000,
                description: `${toastMsg} - failed`
            })
            showErrorModal(
                'Delete offsets',
                <span>
                    Could not delete selected offsets
                    in consumer group <span className="codeBox">{group.groupId}</span>.
                </span>,
                toJson(err, 4)
            );
        } finally {
            api.refreshConsumerGroups(true);

            const remainingOffsets = group.topicOffsets.sum(t => t.partitionOffsets.length) - offsets.length;
            if (remainingOffsets == 0) {
                // Group is fully deleted, go back to list
                appGlobal.history.replace('/groups');
            } else {
                this.props.onClose();
            }
        }
    }

}

function createEditRequest(offsets: GroupOffset[]): EditConsumerGroupOffsetsTopic[] {

    const getOffset = function (x: GroupOffset['newOffset']): number | undefined {

        // no offset set
        if (x == null) return undefined;

        // from other group
        if (typeof x == 'number') return x;

        // from timestamp
        if ('offset' in x) return x.offset;

        // otherwise 'x' might be 'Date', which means timestamps are resolved yet
        return undefined;
    };

    const topicOffsets = offsets.groupInto(x => x.topicName).map(t => ({
        topicName: t.key,
        partitions: t.items.map(p => ({
            partitionId: p.partitionId,
            offset: getOffset(p.newOffset),
        }))
    }));

    // filter undefined partitions
    for (const t of topicOffsets)
        t.partitions.removeAll(p => p.offset == null);

    // assert type:
    // we know that there can't be any undefined offsets anymore
    const cleanOffsets = topicOffsets as {
        topicName: string;
        partitions: {
            partitionId: number;
            offset: number;
        }[];
    }[];

    // filter topics with zero partitions
    cleanOffsets.removeAll(t => t.partitions.length == 0);

    return cleanOffsets;
}


function createDeleteRequest(offsets: GroupOffset[]): DeleteConsumerGroupOffsetsTopic[] {

    const topicOffsets = offsets.groupInto(x => x.topicName).map(t => ({
        topicName: t.key,
        partitions: t.items.map(p => ({
            partitionId: p.partitionId,
        }))
    }));

    // filter topics with zero partitions
    topicOffsets.removeAll(t => t.partitions.length == 0);

    return topicOffsets;
}
