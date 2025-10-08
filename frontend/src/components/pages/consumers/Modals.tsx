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

import { ChevronLeftIcon, ChevronRightIcon, SkipIcon, TrashIcon } from '@primer/octicons-react';
import {
  Accordion,
  Box,
  Button,
  createStandaloneToast,
  DataTable,
  Flex,
  FormLabel,
  HStack,
  List,
  ListItem,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  NumberInput,
  Radio,
  redpandaTheme,
  redpandaToastOptions,
  Text,
  Tooltip,
  UnorderedList,
} from '@redpanda-data/ui';
import { action, autorun, type IReactionDisposer, makeObservable, observable, transaction } from 'mobx';
import { observer } from 'mobx-react';
import { Component } from 'react';
import { MdOutlineWarningAmber } from 'react-icons/md';

import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import type {
  DeleteConsumerGroupOffsetsTopic,
  EditConsumerGroupOffsetsTopic,
  GroupDescription,
  PartitionOffset,
  TopicOffset,
} from '../../../state/restInterfaces';
import { toJson } from '../../../utils/jsonUtils';
import { InfoText, numberToThousandsString } from '../../../utils/tsxUtils';
import { showErrorModal } from '../../misc/ErrorModal';
import { KowlTimePicker } from '../../misc/KowlTimePicker';
import { SingleSelect } from '../../misc/Select';

type EditOptions = 'startOffset' | 'endOffset' | 'time' | 'otherGroup' | 'shiftBy';

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
    duration: 2000,
  },
});

@observer
export class EditOffsetsModal extends Component<{
  group: GroupDescription;
  offsets: GroupOffset[] | null;
  onClose: () => void;
  initialTopic: string | null;
  initialPartition: number | null;
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
  @observable selectedTopic: string | null = null;
  @observable selectedPartition: number | null = null;
  @observable timestampUtcMs: number = Date.now();
  @observable offsetShiftByValue = 0;
  @observable offsetShiftByValueAsString = '0';

  @observable otherConsumerGroups: GroupDescription[] = [];
  @observable selectedGroup: string | undefined = undefined;
  @observable otherGroupCopyMode: 'all' | 'onlyExisting' = 'onlyExisting';

  @observable isLoadingTimestamps = false;
  @observable isApplyingEdit = false;

  constructor(p: any) {
    super(p);
    makeObservable(this);
  }

  componentDidMount() {
    this.selectedTopic = this.props.initialTopic;
    this.selectedPartition = this.props.initialPartition;
  }

  render() {
    let offsets = this.props.offsets;

    const visible = Boolean(offsets);
    this.updateVisible(visible);
    if (offsets) {
      this.lastOffsets = offsets;
    }
    offsets = offsets ?? this.lastOffsets;
    if (!offsets) {
      return null;
    }

    this.offsetsByTopic = offsets.groupInto((x) => x.topicName).map((g) => ({ topicName: g.key, items: g.items }));

    return (
      <>
        <ToastContainer />
        <Modal isOpen={visible} onClose={() => {}}>
          <ModalOverlay />
          <ModalContent minW="3xl">
            <ModalHeader>Edit consumer group</ModalHeader>
            <ModalBody>
              <HStack spacing={6}>
                <Text>
                  You are editing a group with {this.offsetsByTopic.length}{' '}
                  {this.offsetsByTopic.length === 1 ? 'topic' : 'topics'} and {offsets.length}{' '}
                  {offsets.length === 1 ? 'partition' : 'partitions'}.
                </Text>
              </HStack>

              {/* Content */}
              <div style={{ marginTop: '2em' }}>
                {this.page === 0 ? <div key="p1">{this.page1()}</div> : <div key="p2">{this.page2()}</div>}
              </div>
            </ModalBody>
            <ModalFooter gap={2}>{this.footer()}</ModalFooter>
          </ModalContent>
        </Modal>
      </>
    );
  }

  page1() {
    const topicChoices = this.props.offsets?.groupInto((x) => x.topicName).map((x) => x.key) ?? [];

    return (
      <Flex flexDirection="column" gap={4}>
        <Flex flexDirection="column" gap={2} maxW={300}>
          <Box>
            <FormLabel>Topic</FormLabel>
            <SingleSelect<string | null>
              onChange={action((v) => {
                this.selectedTopic = v;
              })}
              options={[
                {
                  value: null,
                  label: 'All Topics',
                },
                ...topicChoices.map((x) => ({
                  value: x,
                  label: x,
                })),
              ]}
              value={this.selectedTopic}
            />
          </Box>
          {this.selectedTopic !== null && (
            <Box>
              <FormLabel>Partition</FormLabel>
              <SingleSelect
                onChange={action((v: number | null) => {
                  this.selectedPartition = v;
                })}
                options={[
                  {
                    value: null,
                    label: 'All Partitions',
                  },
                  ...(this.props.offsets
                    ?.filter((x) => x.topicName === this.selectedTopic)
                    ?.sort((a, b) => a.partitionId - b.partitionId)
                    ?.map((x: GroupOffset) => ({
                      value: x.partitionId,
                      label: x.partitionId.toString(),
                    })) ?? []),
                ]}
                value={this.selectedPartition}
              />
            </Box>
          )}
          <Box>
            <FormLabel>Strategy</FormLabel>
            <SingleSelect
              isDisabled={this.isLoadingTimestamps}
              onChange={(v) => (this.selectedOption = v as EditOptions)}
              options={[
                {
                  value: 'startOffset',
                  label: 'Earliest',
                },
                {
                  value: 'endOffset',
                  label: 'Latest',
                },
                {
                  value: 'shiftBy',
                  label: 'Shift By',
                },
                {
                  value: 'time',
                  label: 'Specific Time',
                },
                {
                  value: 'otherGroup',
                  label: 'Other Consumer Group',
                },
              ]}
              value={this.selectedOption}
            />
          </Box>
        </Flex>

        <Text>
          {
            (
              {
                startOffset: "Set all offsets to the oldest partition's offset.",
                endOffset: "Set all offsets to the newest partition's offset.",
                time: "Choose a timestamp to which all partition's offsets will be set.",
                otherGroup: 'Copy offsets from another (inactive) consumer group',
                shiftBy: 'Adjust offsets by a specified positive or negative value.',
              } as Record<EditOptions, string>
            )[this.selectedOption]
          }
        </Text>

        {this.selectedOption === 'time' && (
          <Box mt={2}>
            <FormLabel>Timestamp</FormLabel>
            <KowlTimePicker
              disabled={this.isLoadingTimestamps}
              onChange={(t) => (this.timestampUtcMs = t)}
              valueUtcMs={this.timestampUtcMs}
            />
          </Box>
        )}

        {this.selectedOption === 'shiftBy' && (
          <Box mt={2}>
            <FormLabel>Shift by</FormLabel>
            <NumberInput
              onBlur={() => {
                if (Number.isNaN(this.offsetShiftByValue)) {
                  this.offsetShiftByValueAsString = '0';
                  this.offsetShiftByValue = 0;
                }
              }}
              onChange={(valueAsString, valueAsNumber) => {
                // entering '-' or '.' without any digits will set the value to -Number.MAX_SAFE_INTEGER
                // we want to prevent this and set the value to 0 instead in onBlur
                if (valueAsNumber !== -Number.MAX_SAFE_INTEGER) {
                  this.offsetShiftByValueAsString = valueAsString;
                  this.offsetShiftByValue = valueAsNumber;
                }
              }}
              value={this.offsetShiftByValueAsString}
            />
          </Box>
        )}

        {this.selectedOption === 'otherGroup' && (
          <Box mt={2}>
            <div
              style={{
                display: 'flex',
                gap: '.5em',
                flexDirection: 'column',
                paddingTop: '12px',
                marginLeft: '-1px',
              }}
            >
              <SingleSelect
                isDisabled={this.isLoadingTimestamps}
                onChange={(x) => (this.selectedGroup = x)}
                options={this.otherConsumerGroups.map((g) => ({ value: g.groupId, label: g.groupId }))}
                value={this.selectedGroup}
              />

              <Radio
                isChecked={this.otherGroupCopyMode === 'onlyExisting'}
                onClick={() => {
                  this.otherGroupCopyMode = 'onlyExisting';
                }}
                value="onlyExisting"
              >
                <InfoText
                  maxWidth="450px"
                  tooltip="Will only lookup the offsets for the topics/partitions that are defined in this group. If the other group has offsets for some additional topics/partitions they will be ignored."
                >
                  Copy matching offsets
                </InfoText>
              </Radio>

              <Radio
                isChecked={this.otherGroupCopyMode === 'all'}
                onClick={() => {
                  this.otherGroupCopyMode = 'all';
                }}
                value="all"
              >
                <InfoText
                  maxWidth="450px"
                  tooltip="If the selected group has offsets for some topics/partitions that don't exist in the current consumer group, they will be copied anyway."
                >
                  Full Copy
                </InfoText>
              </Radio>
            </div>
          </Box>
        )}
      </Flex>
    );
  }

  page2() {
    return (
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        <Accordion
          defaultIndex={0}
          items={this.offsetsByTopic
            .filter(({ topicName }) => this.selectedTopic === null || topicName === this.selectedTopic)
            .map(({ topicName, items }) => ({
              heading: (
                <Flex alignItems="center" fontWeight={600} gap={1} whiteSpace="nowrap">
                  {/* Title */}
                  <Text overflow="hidden" pr={8} textOverflow="ellipsis">
                    {topicName}
                  </Text>
                  <Text display="inline-block" ml="auto" padding="0 1rem">
                    {items.length} Partitions
                  </Text>
                </Flex>
              ),
              description: (
                <DataTable<GroupOffset>
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
                      cell: ({
                        row: {
                          original: { offset },
                        },
                      }) =>
                        offset == null ? (
                          <Tooltip
                            hasArrow
                            label="The group does not have an offset for this partition yet"
                            openDelay={1}
                            placement="top"
                          >
                            <span style={{ opacity: 0.66, marginLeft: '2px' }}>
                              <SkipIcon />
                            </span>
                          </Tooltip>
                        ) : (
                          numberToThousandsString(offset)
                        ),
                    },
                    {
                      header: 'Offset After',
                      id: 'offsetAfter',
                      size: Number.POSITIVE_INFINITY,
                      cell: ({ row: { original } }) => (
                        <ColAfter record={original} selectedTime={this.timestampUtcMs} />
                      ),
                    },
                  ]}
                  data={items}
                  defaultPageSize={100}
                  pagination
                  size="sm"
                  sorting
                />
              ),
            }))}
        />
      </div>
    );
  }

  @action
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complexity 54, refactor later
  setPage(page: 0 | 1) {
    if (page === 1) {
      // compute and set newOffset
      if (this.props.offsets == null) {
        return;
      }
      const op = this.selectedOption;

      // reset all newOffset
      for (const x of this.props.offsets) {
        x.newOffset = undefined;
      }

      // filter selected offsets to be edited
      const selectedOffsets = this.props.offsets.filter(
        (x) => this.selectedPartition === null || x.partitionId === this.selectedPartition
      );

      if (op === 'startOffset') {
        // Earliest
        for (const x of selectedOffsets) {
          x.newOffset = -2;
        }
      } else if (op === 'endOffset') {
        // Latest
        for (const x of selectedOffsets) {
          x.newOffset = -1;
        }
      } else if (op === 'shiftBy') {
        for (const x of selectedOffsets) {
          if (x.offset) {
            x.newOffset = x.offset + this.offsetShiftByValue;
          }
        }
      } else if (op === 'time') {
        // Time
        // for (const x of this.props.offsets) {
        //   x.newOffset = new Date(this.timestampUtcMs) as any;
        // }
        for (const x of selectedOffsets) {
          x.newOffset = 'fetching offsets...' as any;
        }
        const requiredTopics = selectedOffsets.map((x) => x.topicName).distinct();

        // Fetch offset for each partition
        setTimeout(async () => {
          const toastMsg = 'Fetching offsets for timestamp';
          const toastRef = toast({
            status: 'loading',
            description: `${toastMsg}...`,
            duration: null,
          });

          let offsetsForTimestamp: TopicOffset[];
          try {
            offsetsForTimestamp = await api.getTopicOffsetsByTimestamp(requiredTopics, this.timestampUtcMs);
            toast.update(toastRef, {
              status: 'success',
              duration: 2000,
              description: `${toastMsg} - done`,
            });
          } catch (err) {
            showErrorModal(
              'Failed to fetch offsets for timestamp',
              <span>
                Could not lookup offsets for given timestamp{' '}
                <span className="codeBox">{new Date(this.timestampUtcMs).toUTCString()}</span>.
              </span>,
              toJson({ errors: err, request: requiredTopics }, 4)
            );
            toast.update(toastRef, {
              status: 'error',
              duration: 2000,
              description: `${toastMsg} - failed`,
            });
            return;
          }

          for (const x of selectedOffsets) {
            const responseOffset = offsetsForTimestamp
              .first((t) => t.topicName === x.topicName)
              ?.partitions.first((p) => p.partitionId === x.partitionId);
            x.newOffset = responseOffset;
          }
        });
      } else {
        // Other group
        // Lookup offsets from the other group
        const other = api.consumerGroups.get(this.selectedGroup ?? '');
        if (other) {
          // Helper functions
          const getOffset = (topicName: string, partitionId: number): number | undefined =>
            other.topicOffsets
              .first((t) => t.topic === topicName)
              ?.partitionOffsets.first((p) => p.partitionId === partitionId)?.groupOffset;

          const currentOffsets = this.props.offsets;
          const alreadyExists = (topicName: string, partitionId: number): boolean =>
            currentOffsets.any((x) => x.topicName === topicName && x.partitionId === partitionId);

          //
          // Copy offsets that exist in the current group from the other group
          for (const x of selectedOffsets) {
            x.newOffset = getOffset(x.topicName, x.partitionId);
          }

          //
          // Extend our offsets with any offsets that our group currently doesn't have
          if (this.otherGroupCopyMode === 'all') {
            const otherFlat = other.topicOffsets.flatMap((x) =>
              x.partitionOffsets.flatMap((p) => ({
                topicName: x.topic,
                partitionId: p.partitionId,
                offset: p.groupOffset,
              }))
            );

            for (const o of otherFlat) {
              if (!alreadyExists(o.topicName, o.partitionId)) {
                currentOffsets.push({
                  topicName: o.topicName,
                  partitionId: o.partitionId,
                  offset: undefined,
                  newOffset: o.offset,
                });
              }
            }
          }
        } else {
          showErrorModal(
            'Consumer group not found',
            null,
            <span>
              Could not find a consumer group named <span className="codeBox">{this.selectedGroup}</span> to compute new
              offsets.
            </span>
          );
        }
      }
    }

    this.page = page;
  }

  footer() {
    const disableContinue = this.selectedOption === 'otherGroup' && !this.selectedGroup;
    const disableNav = this.isApplyingEdit || this.isLoadingTimestamps;

    if (this.page === 0) {
      return (
        <Flex gap={2}>
          <Button key="cancel" onClick={this.props.onClose}>
            Cancel
          </Button>

          <Button
            isDisabled={disableContinue || disableNav}
            isLoading={this.isLoadingTimestamps}
            key="next"
            onClick={() => this.setPage(1)}
            variant="solid"
          >
            <span>Review</span>
            <span>
              <ChevronRightIcon />
            </span>
          </Button>
        </Flex>
      );
    }

    return (
      <Flex gap={2}>
        <Button isDisabled={disableNav} key="back" onClick={() => this.setPage(0)} style={{ paddingRight: '18px' }}>
          <span>
            <ChevronLeftIcon />
          </span>
          <span>Back</span>
        </Button>

        <Button key="cancel" onClick={this.props.onClose} style={{ marginLeft: 'auto' }}>
          Cancel
        </Button>

        <Button isDisabled={disableNav} key="next" onClick={() => this.onApplyEdit()} variant="solid">
          <span>Apply</span>
        </Button>
      </Flex>
    );
  }

  updateVisible(visible: boolean) {
    if (visible === this.lastVisible) {
      return;
    }

    if (visible) {
      setTimeout(() => {
        // modal became visible

        // need all groups for "other groups" dropdown
        api.refreshConsumerGroups();

        // need watermarks for all topics the group consumes
        // in order to know earliest/latest offsets
        const topics = this.props.group.topicOffsets.map((x) => x.topic).distinct();
        api.refreshPartitions(topics, true);

        this.autorunDisposer = autorun(() => {
          this.otherConsumerGroups = [...api.consumerGroups.values()].filter(
            (g) => g.groupId !== this.props.group.groupId
          );
        });

        // reset settings
        transaction(() => {
          this.setPage(0);
          this.selectedOption = 'startOffset';
        });
      });
    } else if (this.autorunDisposer) {
      this.autorunDisposer();
      this.autorunDisposer = null;
    }

    this.lastVisible = visible;
  }

  @action
  async onApplyEdit() {
    const group = this.props.group;
    // biome-ignore lint/style/noNonNullAssertion: not touching MobX observables
    const offsets = this.props.offsets!.filter(
      ({ topicName, partitionId }) =>
        (this.selectedTopic === null || topicName === this.selectedTopic) &&
        (this.selectedPartition === null || partitionId === this.selectedPartition)
    );

    this.isApplyingEdit = true;
    const toastMsg = 'Applying offsets';
    const toastRef = toast({
      status: 'loading',
      description: `${toastMsg}...`,
      duration: null,
    });
    const topics = createEditRequest(offsets);
    try {
      const editResponse = await api.editConsumerGroupOffsets(group.groupId, topics);
      const errors = editResponse
        .map((t) => ({
          ...t,
          partitions: t.partitions.filter((x) => x.error),
        }))
        .filter((t) => t.partitions.length > 0);
      if (errors.length > 0) {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error('apply offsets, backend errors', { errors, request: topics });
        throw new Error(`Apply offsets failed with ${errors.length} errors`);
      }

      toast.update(toastRef, {
        status: 'success',
        duration: 2000,
        description: `${toastMsg} - done`,
      });
    } catch (err) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('failed to apply offset edit', err);
      toast.update(toastRef, {
        status: 'error',
        duration: 2000,
        description: `${toastMsg} - failed`,
      });
      showErrorModal(
        'Apply editted offsets',
        <span>
          Could not apply offsets for consumer group <span className="codeBox">{group.groupId}</span>.
        </span>,
        toJson(err, 4)
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
  selectedTime?: number;
  record: GroupOffset;
}> {
  render() {
    const record = this.props.record;
    const val = record.newOffset;

    // No change
    if (val == null) {
      return (
        <Tooltip hasArrow label="Offset will not be changed" openDelay={1} placement="top">
          <span style={{ opacity: 0.66, marginLeft: '2px' }}>
            <SkipIcon />
          </span>
        </Tooltip>
      );
    }

    // Set by timestamp
    if (typeof val === 'object') {
      // placeholder while loading
      if (val instanceof Date) {
        return val.toLocaleString();
      }

      // actual offset
      if ('offset' in val) {
        // error
        if (val.error) {
          return <span style={{ color: 'orangered' }}>{val.error}</span>;
        }

        // successful fetch
        if (val.timestamp > 0) {
          return (
            <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
              <span>{numberToThousandsString(val.offset)}</span>
              <span
                style={{
                  fontSize: 'smaller',
                  color: 'hsl(0deg 0% 67%)',
                  userSelect: 'none',
                  cursor: 'default',
                }}
              >
                ({new Date(val.timestamp).toLocaleString()})
              </span>
            </div>
          );
        }

        // not found - no message after given timestamp
        // use 'latest'
        const partition = api.topicPartitions.get(record.topicName)?.first((p) => p.id === record.partitionId);
        return (
          <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
            <InfoText
              icon={<MdOutlineWarningAmber size={14} />}
              iconColor="orangered"
              iconSize="18px"
              maxWidth="350px"
              tooltip={
                <div>
                  There is no offset for this partition at or after the given timestamp (
                  <code>{new Date(this.props.selectedTime ?? 0).toLocaleString()}</code>). As a fallback, the last
                  offset in that partition will be used.
                </div>
              }
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
      if (val >= 0) {
        return numberToThousandsString(val);
      }

      // Get offset from current partition values
      const partition = api.topicPartitions.get(record.topicName)?.first((p) => p.id === record.partitionId);

      const content =
        val === -2
          ? { name: 'Earliest', offset: partition?.waterMarkLow ?? '...' }
          : { name: 'Latest', offset: partition?.waterMarkHigh ?? '...' };

      return (
        <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
          <span>{typeof content.offset === 'number' ? numberToThousandsString(content.offset) : content.offset}</span>
          <span
            style={{
              fontSize: 'smaller',
              color: 'hsl(0deg 0% 67%)',
              userSelect: 'none',
              cursor: 'default',
            }}
          >
            ({content.name})
          </span>
        </div>
      );
    }

    // Loading placeholder
    if (typeof val === 'string') {
      return <span style={{ opacity: 0.66, fontStyle: 'italic' }}>{val}</span>;
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
  group: GroupDescription;
  mode: GroupDeletingMode;
  offsets: GroupOffset[] | null;
  onClose: () => void;
  onInit: () => void;
  disabledReason?: string;
}> {
  lastOffsets: GroupOffset[];

  render() {
    const { group, mode } = this.props;
    let offsets = this.props.offsets;

    const visible = Boolean(offsets);
    if (offsets) {
      this.lastOffsets = offsets;
    }
    offsets = offsets ?? this.lastOffsets;

    const offsetsByTopic = offsets?.groupInto((x) => x.topicName).map((g) => ({ topicName: g.key, items: g.items }));
    const singlePartition = offsets?.length === 1;

    return (
      <Modal isOpen={visible} onClose={this.props.onClose}>
        <ModalOverlay />
        <ModalContent minW="5xl">
          <ModalHeader>{mode === 'group' ? 'Delete consumer group' : 'Delete consumer group offsets'}</ModalHeader>
          <ModalBody>
            <Flex flexDirection="row" gap={6}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  padding: '16px',
                  background: '#F53649',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* @ts-ignore */}
                <TrashIcon color="white" />
              </div>
              <Box>
                {visible && (
                  <Box>
                    {mode === 'group' && (
                      <Box>
                        <Box borderRadius="md" mb={4}>
                          <Text>This action will delete the following consumer group:</Text>
                        </Box>

                        <Flex flexDirection="column" gap={1}>
                          <Text>
                            <Text as="span" fontWeight="bold">
                              Name:
                            </Text>{' '}
                            {group.groupId}
                          </Text>

                          <Text>
                            <Text as="span" fontWeight="bold">
                              Partitions:
                            </Text>{' '}
                            {offsets.length}
                          </Text>

                          <Text>
                            <Text as="span" fontWeight="bold">
                              Topics:
                            </Text>{' '}
                            {offsetsByTopic.length}
                          </Text>

                          <Text>Are you sure?</Text>
                        </Flex>
                      </Box>
                    )}

                    {mode === 'topic' && (
                      <Box>
                        <Text>Group offsets will be deleted for topic:</Text>
                        <List fontWeight="600" my={2}>
                          <ListItem>
                            Topic: <span className="codeBox">{offsetsByTopic[0].topicName}</span>
                          </ListItem>
                          <ListItem>
                            {offsets.length} {singlePartition ? 'Partition' : 'Partitions'}
                          </ListItem>
                        </List>
                      </Box>
                    )}

                    {mode === 'partition' && (
                      <Box>
                        <Text>Group offsets will be deleted for partition:</Text>
                        <UnorderedList fontWeight="600" my={2}>
                          <ListItem>
                            Topic: <span className="codeBox">{offsetsByTopic[0].topicName}</span>
                          </ListItem>
                          <ListItem>
                            Partition: <span className="codeBox">{offsetsByTopic[0].items[0].partitionId}</span>
                          </ListItem>
                        </UnorderedList>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            </Flex>
          </ModalBody>
          <ModalFooter>
            <Button
              colorScheme="red"
              onClick={async (dismiss: (value?: unknown) => void, onError: (msg: string) => void) => {
                const group = this.props.group;
                // biome-ignore lint/style/noNonNullAssertion: not touching MobX observables
                const offsets = this.props.offsets!;

                const toastMsg = 'Deleting offsets';
                const toastRef = toast({
                  status: 'loading',
                  description: `${toastMsg}...`,
                  duration: null,
                });
                try {
                  if (this.props.mode === 'group') {
                    await api.deleteConsumerGroup(group.groupId);
                  } else {
                    const deleteRequest = createDeleteRequest(offsets);
                    const deleteResponse = await api.deleteConsumerGroupOffsets(group.groupId, deleteRequest);
                    const errors = deleteResponse
                      .map((t) => ({
                        ...t,
                        partitions: t.partitions.filter((x) => x.error),
                      }))
                      .filter((t) => t.partitions.length > 0);
                    if (errors.length > 0) {
                      // biome-ignore lint/suspicious/noConsole: intentional console usage
                      console.error('backend returned errors for deleteOffsets', {
                        request: deleteRequest,
                        errors,
                      });
                      throw new Error(`Delete offsets failed with ${errors.length} errors`);
                    }
                  }

                  toast.update(toastRef, {
                    status: 'success',
                    duration: 2000,
                    description: `${toastMsg} - done`,
                  });

                  const remainingOffsets = group.topicOffsets.sum((t) => t.partitionOffsets.length) - offsets.length;
                  if (remainingOffsets === 0) {
                    // Group is fully deleted, go back to list
                    this.props.onClose();
                    appGlobal.historyReplace('/groups');
                  } else {
                    this.props.onClose();
                    dismiss();
                  }
                } catch (err) {
                  toast.close(toastRef);
                  // biome-ignore lint/suspicious/noConsole: intentional console usage
                  console.error(err);
                  onError(`Could not delete selected offsets in consumer group ${group.groupId} - ${toJson(err, 4)}`);
                } finally {
                  api.refreshConsumerGroups(true);
                }
              }}
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    );
  }
}

// Utility functions
function createEditRequest(offsets: GroupOffset[]): EditConsumerGroupOffsetsTopic[] {
  const getOffset = (x: GroupOffset['newOffset']): number | undefined => {
    // no offset set
    if (x == null) {
      return;
    }

    // from other group
    if (typeof x === 'number') {
      return x;
    }

    // from timestamp
    if ('offset' in x) {
      return x.offset;
    }

    // otherwise 'x' might be 'Date', which means timestamps are resolved yet
    return;
  };

  const topicOffsets = offsets
    .groupInto((x) => x.topicName)
    .map((t) => ({
      topicName: t.key,
      partitions: t.items.map((p) => ({
        partitionId: p.partitionId,
        offset: getOffset(p.newOffset),
      })),
    }));

  // filter undefined partitions
  for (const t of topicOffsets) {
    t.partitions.removeAll((p) => p.offset == null);
  }

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
  cleanOffsets.removeAll((t) => t.partitions.length === 0);

  return cleanOffsets;
}

function createDeleteRequest(offsets: GroupOffset[]): DeleteConsumerGroupOffsetsTopic[] {
  const topicOffsets = offsets
    .groupInto((x) => x.topicName)
    .map((t) => ({
      topicName: t.key,
      partitions: t.items.map((p) => ({
        partitionId: p.partitionId,
      })),
    }));

  // filter topics with zero partitions
  topicOffsets.removeAll((t) => t.partitions.length === 0);

  return topicOffsets;
}
