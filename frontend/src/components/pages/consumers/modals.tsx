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

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronLeftIcon, ChevronRightIcon, SkipIcon, TrashIcon, WarningIcon } from 'components/icons';
import { Component, type ReactNode, useRef, useState } from 'react';
import { toast as sonnerToast } from 'sonner';

import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import type {
  DeleteConsumerGroupOffsetsTopic,
  EditConsumerGroupOffsetsTopic,
  GroupDescription,
  PartitionOffset,
  TopicOffset,
} from '../../../state/rest-interfaces';
import { toJson } from '../../../utils/json-utils';
import { numberToThousandsString } from '../../../utils/tsx-utils';
import { showErrorModal } from '../../misc/error-modal';
import { KowlTimePicker } from '../../misc/kowl-time-picker';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../redpanda-ui/components/accordion';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../redpanda-ui/components/alert-dialog';
import { Button as UiButton } from '../../redpanda-ui/components/button';
import { DataTableColumnHeader } from '../../redpanda-ui/components/data-table';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../redpanda-ui/components/dialog';
import { Input } from '../../redpanda-ui/components/input';
import { Label } from '../../redpanda-ui/components/label';
import { RadioGroup, RadioGroupItem } from '../../redpanda-ui/components/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../redpanda-ui/components/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../redpanda-ui/components/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../redpanda-ui/components/tooltip';
import { InlineCode } from '../../redpanda-ui/components/typography';

const ALL_SENTINEL = '__all__';

const STRATEGY_LABELS: Record<EditOptions, string> = {
  startOffset: 'Earliest',
  endOffset: 'Latest',
  shiftBy: 'Shift By',
  time: 'Specific Time',
  otherGroup: 'Other Consumer Group',
};

/** Inline text with an explanatory tooltip on hover (replaces the legacy InfoText). */
const InfoTooltip = ({ text, children }: { text: string; children: ReactNode }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger
        render={<span className="cursor-help underline decoration-dotted underline-offset-2">{children}</span>}
      />
      <TooltipContent className="max-w-[450px]">{text}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

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

type EditOffsetsModalState = {
  page: 0 | 1;
  selectedOption: EditOptions;
  selectedTopic: string | null;
  selectedPartition: number | null;
  timestampUtcMs: number;
  offsetShiftByValue: number;
  offsetShiftByValueAsString: string;
  selectedGroup: string | undefined;
  otherGroupCopyMode: 'all' | 'onlyExisting';
  isLoadingTimestamps: boolean;
  isApplyingEdit: boolean;
};

export class EditOffsetsModal extends Component<{
  group: GroupDescription;
  offsets: GroupOffset[] | null;
  onClose: () => void;
  initialTopic: string | null;
  initialPartition: number | null;
}> {
  lastOffsets!: GroupOffset[];
  lastVisible = false;
  offsetsByTopic: {
    topicName: string;
    items: GroupOffset[];
  }[] = [];

  state: EditOffsetsModalState = {
    page: 0,
    selectedOption: 'startOffset',
    selectedTopic: null,
    selectedPartition: null,
    timestampUtcMs: Date.now(),
    offsetShiftByValue: 0,
    offsetShiftByValueAsString: '0',
    selectedGroup: undefined,
    otherGroupCopyMode: 'onlyExisting',
    isLoadingTimestamps: false,
    isApplyingEdit: false,
  };

  componentDidMount() {
    this.setState({
      selectedTopic: this.props.initialTopic,
      selectedPartition: this.props.initialPartition,
    });
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
      <Dialog
        onOpenChange={(open) => {
          if (!(open || this.state.isApplyingEdit || this.state.isLoadingTimestamps)) {
            this.props.onClose();
          }
        }}
        open={visible}
      >
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>Edit consumer group</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-body">
              You are editing a group with {this.offsetsByTopic.length}{' '}
              {this.offsetsByTopic.length === 1 ? 'topic' : 'topics'} and {offsets.length}{' '}
              {offsets.length === 1 ? 'partition' : 'partitions'}.
            </p>

            {/* Content */}
            <div className="mt-8">
              {this.state.page === 0 ? <div key="p1">{this.page1()}</div> : <div key="p2">{this.page2()}</div>}
            </div>
          </DialogBody>
          <DialogFooter>{this.footer()}</DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  page1() {
    const topicChoices = this.props.offsets?.groupInto((x) => x.topicName).map((x) => x.key) ?? [];
    const otherConsumerGroups = [...api.consumerGroups.values()].filter((g) => g.groupId !== this.props.group.groupId);

    const partitionOptions =
      this.props.offsets
        ?.filter((x) => x.topicName === this.state.selectedTopic)
        ?.sort((a, b) => a.partitionId - b.partitionId) ?? [];

    return (
      <div className="flex flex-col gap-4">
        <div className="flex max-w-[300px] flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label>Topic</Label>
            <Select
              onValueChange={(v) => this.setState({ selectedTopic: v === ALL_SENTINEL ? null : v })}
              value={this.state.selectedTopic ?? ALL_SENTINEL}
            >
              <SelectTrigger>
                <SelectValue>{(v) => (v === ALL_SENTINEL ? 'All Topics' : (v as string))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SENTINEL}>All Topics</SelectItem>
                {topicChoices.map((x) => (
                  <SelectItem key={x} value={x}>
                    {x}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {this.state.selectedTopic !== null && (
            <div className="flex flex-col gap-1">
              <Label>Partition</Label>
              <Select
                onValueChange={(v) => this.setState({ selectedPartition: v === ALL_SENTINEL ? null : Number(v) })}
                value={this.state.selectedPartition === null ? ALL_SENTINEL : String(this.state.selectedPartition)}
              >
                <SelectTrigger>
                  <SelectValue>{(v) => (v === ALL_SENTINEL ? 'All Partitions' : (v as string))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>All Partitions</SelectItem>
                  {partitionOptions.map((x) => (
                    <SelectItem key={x.partitionId} value={String(x.partitionId)}>
                      {x.partitionId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Label>Strategy</Label>
            <Select
              disabled={this.state.isLoadingTimestamps}
              onValueChange={(v) => this.setState({ selectedOption: v as EditOptions })}
              value={this.state.selectedOption}
            >
              <SelectTrigger>
                <SelectValue>{(v) => STRATEGY_LABELS[v as EditOptions]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="startOffset">Earliest</SelectItem>
                <SelectItem value="endOffset">Latest</SelectItem>
                <SelectItem value="shiftBy">Shift By</SelectItem>
                <SelectItem value="time">Specific Time</SelectItem>
                <SelectItem value="otherGroup">Other Consumer Group</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-body text-muted-foreground">
          {
            (
              {
                startOffset: "Set all offsets to the oldest partition's offset.",
                endOffset: "Set all offsets to the newest partition's offset.",
                time: "Choose a timestamp to which all partition's offsets will be set.",
                otherGroup: 'Copy offsets from another (inactive) consumer group',
                shiftBy: 'Adjust offsets by a specified positive or negative value.',
              } as Record<EditOptions, string>
            )[this.state.selectedOption]
          }
        </p>

        {this.state.selectedOption === 'time' && (
          <div className="mt-2 flex max-w-[300px] flex-col gap-1">
            <Label>Timestamp</Label>
            <KowlTimePicker
              disabled={this.state.isLoadingTimestamps}
              onChange={(t) => {
                this.setState({ timestampUtcMs: t });
              }}
              valueUtcMs={this.state.timestampUtcMs}
            />
          </div>
        )}

        {this.state.selectedOption === 'shiftBy' && (
          <div className="mt-2 flex max-w-[300px] flex-col gap-1">
            <Label>Shift by</Label>
            <Input
              onBlur={() => {
                if (Number.isNaN(this.state.offsetShiftByValue)) {
                  this.setState({ offsetShiftByValueAsString: '0', offsetShiftByValue: 0 });
                }
              }}
              onChange={(e) => {
                const valueAsString = e.target.value;
                const valueAsNumber = valueAsString === '' ? Number.NaN : Number(valueAsString);
                this.setState({ offsetShiftByValueAsString: valueAsString, offsetShiftByValue: valueAsNumber });
              }}
              type="number"
              value={this.state.offsetShiftByValueAsString}
            />
          </div>
        )}

        {this.state.selectedOption === 'otherGroup' && (
          <div className="mt-2 flex max-w-[300px] flex-col gap-2.5">
            <Select
              disabled={this.state.isLoadingTimestamps}
              onValueChange={(x) => this.setState({ selectedGroup: x })}
              value={this.state.selectedGroup ?? ''}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a consumer group" />
              </SelectTrigger>
              <SelectContent>
                {otherConsumerGroups.map((g) => (
                  <SelectItem key={g.groupId} value={g.groupId}>
                    {g.groupId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <RadioGroup
              onValueChange={(v) => this.setState({ otherGroupCopyMode: v as 'all' | 'onlyExisting' })}
              value={this.state.otherGroupCopyMode}
            >
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <RadioGroupItem value="onlyExisting" />
                <InfoTooltip text="Will only lookup the offsets for the topics/partitions that are defined in this group. If the other group has offsets for some additional topics/partitions they will be ignored.">
                  Copy matching offsets
                </InfoTooltip>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <RadioGroupItem value="all" />
                <InfoTooltip text="If the selected group has offsets for some topics/partitions that don't exist in the current consumer group, they will be copied anyway.">
                  Full Copy
                </InfoTooltip>
              </label>
            </RadioGroup>
          </div>
        )}
      </div>
    );
  }

  page2() {
    const topics = this.offsetsByTopic.filter(
      ({ topicName }) => this.state.selectedTopic === null || topicName === this.state.selectedTopic
    );

    return (
      <div className="max-h-[400px] overflow-y-auto">
        <Accordion defaultValue={topics.length ? [topics[0].topicName] : []} variant="contained">
          {topics.map(({ topicName, items }) => (
            <AccordionItem key={topicName} value={topicName}>
              <AccordionTrigger className="px-4 py-3">
                <div className="flex flex-1 items-center gap-1 font-semibold">
                  <span className="truncate pr-8">{topicName}</span>
                  <span className="ml-auto px-4">{items.length} Partitions</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <OffsetPreviewTable items={items} selectedTime={this.state.timestampUtcMs} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    );
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complexity 54, refactor later
  setPage(page: 0 | 1) {
    if (page === 1) {
      // compute and set newOffset
      if (this.props.offsets === null) {
        return;
      }
      const op = this.state.selectedOption;

      // reset all newOffset
      for (const x of this.props.offsets) {
        x.newOffset = undefined;
      }

      // filter selected offsets to be edited
      const selectedOffsets = this.props.offsets.filter(
        (x) => this.state.selectedPartition === null || x.partitionId === this.state.selectedPartition
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
            x.newOffset = x.offset + this.state.offsetShiftByValue;
          }
        }
      } else if (op === 'time') {
        // Time
        for (const x of selectedOffsets) {
          x.newOffset = 'fetching offsets...' as string & number;
        }
        const requiredTopics = selectedOffsets.map((x) => x.topicName).distinct();

        // Fetch offset for each partition
        setTimeout(async () => {
          const toastMsg = 'Fetching offsets for timestamp';
          const toastId = sonnerToast.loading(`${toastMsg}...`);

          let offsetsForTimestamp: TopicOffset[];
          try {
            offsetsForTimestamp = await api.getTopicOffsetsByTimestamp(requiredTopics, this.state.timestampUtcMs);
            sonnerToast.success(`${toastMsg} - done`, { id: toastId });
          } catch (err) {
            showErrorModal(
              'Failed to fetch offsets for timestamp',
              <span>
                Could not lookup offsets for given timestamp{' '}
                <span className="codeBox">{new Date(this.state.timestampUtcMs).toUTCString()}</span>.
              </span>,
              toJson({ errors: err, request: requiredTopics }, 4)
            );
            sonnerToast.error(`${toastMsg} - failed`, { id: toastId });
            return;
          }

          for (const x of selectedOffsets) {
            const responseOffset = offsetsForTimestamp
              .first((t) => t.topicName === x.topicName)
              ?.partitions.first((p) => p.partitionId === x.partitionId);
            x.newOffset = responseOffset;
          }
          // Trigger re-render so ColAfter sees updated newOffset values
          this.forceUpdate();
        });
      } else {
        // Other group
        // Lookup offsets from the other group
        const other = api.consumerGroups.get(this.state.selectedGroup ?? '');
        if (other) {
          // Helper functions
          const getOffset = (topicName: string, partitionId: number): number | undefined =>
            other.topicOffsets
              .first((t) => t.topic === topicName)
              ?.partitionOffsets.first((p) => p.partitionId === partitionId)?.groupOffset ?? undefined;

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
          if (this.state.otherGroupCopyMode === 'all') {
            const otherFlat = other.topicOffsets.flatMap((x) =>
              x.partitionOffsets
                .filter((p) => p.groupOffset !== null)
                .flatMap((p) => ({
                  topicName: x.topic,
                  partitionId: p.partitionId,
                  offset: p.groupOffset as number,
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
              Could not find a consumer group named <span className="codeBox">{this.state.selectedGroup}</span> to
              compute new offsets.
            </span>
          );
        }
      }
    }

    this.setState({ page });
  }

  footer() {
    const disableContinue = this.state.selectedOption === 'otherGroup' && !this.state.selectedGroup;
    const disableNav = this.state.isApplyingEdit || this.state.isLoadingTimestamps;

    if (this.state.page === 0) {
      return (
        <div className="flex w-full items-center gap-2">
          <UiButton key="cancel" onClick={this.props.onClose} variant="link">
            Cancel
          </UiButton>
          <UiButton
            className="ml-auto"
            disabled={disableContinue || disableNav}
            isLoading={this.state.isLoadingTimestamps}
            key="next"
            onClick={() => this.setPage(1)}
          >
            Review
            <ChevronRightIcon className="h-4 w-4" />
          </UiButton>
        </div>
      );
    }

    return (
      <div className="flex w-full items-center gap-2">
        <UiButton disabled={disableNav} key="back" onClick={() => this.setPage(0)} variant="outline">
          <ChevronLeftIcon className="h-4 w-4" />
          Back
        </UiButton>
        <UiButton key="cancel" onClick={this.props.onClose} variant="link">
          Cancel
        </UiButton>
        <UiButton
          className="ml-auto"
          disabled={disableNav}
          isLoading={this.state.isApplyingEdit}
          key="next"
          onClick={() => this.onApplyEdit()}
        >
          Apply
        </UiButton>
      </div>
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

        // reset settings
        this.setState({ page: 0, selectedOption: 'startOffset' });
      });
    }

    this.lastVisible = visible;
  }

  async onApplyEdit() {
    const group = this.props.group;
    // biome-ignore lint/style/noNonNullAssertion: not touching MobX observables
    const offsets = this.props.offsets!.filter(
      ({ topicName, partitionId }) =>
        (this.state.selectedTopic === null || topicName === this.state.selectedTopic) &&
        (this.state.selectedPartition === null || partitionId === this.state.selectedPartition)
    );

    this.setState({ isApplyingEdit: true });
    const toastMsg = 'Applying offsets';
    const toastId = sonnerToast.loading(`${toastMsg}...`);
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

      sonnerToast.success(`${toastMsg} - done`, { id: toastId });
    } catch (err) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('failed to apply offset edit', err);
      sonnerToast.error(`${toastMsg} - failed`, { id: toastId });
      showErrorModal(
        'Apply editted offsets',
        <span>
          Could not apply offsets for consumer group <span className="codeBox">{group.groupId}</span>.
        </span>,
        toJson(err, 4)
      );
    } finally {
      this.setState({ isApplyingEdit: false });
      api.refreshConsumerGroup(this.props.group.groupId, true);
      this.props.onClose();
    }
  }
}

class ColAfter extends Component<{
  selectedTime?: number;
  record: GroupOffset;
}> {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
  render() {
    const record = this.props.record;
    const val = record.newOffset;

    // No change
    if (val === null) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="ml-0.5 inline-flex opacity-60">
                  <SkipIcon size={16} />
                </span>
              }
            />
            <TooltipContent>Offset will not be changed</TooltipContent>
          </Tooltip>
        </TooltipProvider>
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-flex items-center gap-1.5">
                    <WarningIcon className="text-destructive" size={14} />
                    <span>{numberToThousandsString(partition?.waterMarkHigh ?? -1)}</span>
                  </span>
                }
              />
              <TooltipContent className="max-w-[350px]">
                There is no offset for this partition at or after the given timestamp (
                <code>{new Date(this.props.selectedTime ?? 0).toLocaleString()}</code>). As a fallback, the last offset
                in that partition will be used.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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

/** Page-2 preview of a single topic's partition offsets (Before/After). */
const OffsetPreviewTable = ({ items, selectedTime }: { items: GroupOffset[]; selectedTime: number }) => {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns: ColumnDef<GroupOffset>[] = [
    {
      accessorKey: 'partitionId',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Partition" />,
      meta: { headWidth: 'sm' as const },
    },
    {
      accessorKey: 'offset',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Offset Before" />,
      meta: { headWidth: 'md' as const },
      cell: ({
        row: {
          original: { offset },
        },
      }) =>
        offset === null || offset === undefined ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="ml-0.5 inline-flex opacity-60">
                    <SkipIcon size={16} />
                  </span>
                }
              />
              <TooltipContent>The group does not have an offset for this partition yet</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          numberToThousandsString(offset)
        ),
    },
    {
      id: 'offsetAfter',
      header: 'Offset After',
      enableSorting: false,
      cell: ({ row: { original } }) => <ColAfter record={original} selectedTime={selectedTime} />,
    },
  ];

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const meta = header.column.columnDef.meta as { headWidth?: 'sm' | 'md' | 'full' } | undefined;
              return (
                <TableHead key={header.id} width={meta?.headWidth}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export type GroupDeletingMode = 'group' | 'topic' | 'partition';
// Why do we pass 'mode'?
//   It is the users "intent" (where he clicked).
//   Without it, we'd have to infer it, which is possible, but will result in strange wording.
//   For example:
//     - user is viewing a group that has offsets for only one topic
//     - user clicks 'delete' on the topic
//     - dialog would show "you want to delete ALL offsets for this group"
//       which is technically correct, but might give the impression of deleting more than he wanted
export const DeleteOffsetsModal = (props: {
  group: GroupDescription;
  mode: GroupDeletingMode;
  offsets: GroupOffset[] | null;
  onClose: () => void;
  onInit?: () => void;
  disabledReason?: string;
}) => {
  const { group, mode, offsets, onClose } = props;
  const [isDeleting, setIsDeleting] = useState(false);
  // Keep the last non-null offsets so the dialog content doesn't flash empty during the close animation.
  const lastOffsetsRef = useRef<GroupOffset[]>([]);
  if (offsets) {
    lastOffsetsRef.current = offsets;
  }

  const visible = Boolean(offsets);
  const activeOffsets = offsets ?? lastOffsetsRef.current;
  const offsetsByTopic = activeOffsets.groupInto((x) => x.topicName).map((g) => ({ topicName: g.key, items: g.items }));
  const singlePartition = activeOffsets.length === 1;

  const handleDelete = async () => {
    setIsDeleting(true);
    const toastId = sonnerToast.loading('Deleting offsets...');
    try {
      if (mode === 'group') {
        await api.deleteConsumerGroup(group.groupId);
      } else {
        const deleteRequest = createDeleteRequest(activeOffsets);
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

      sonnerToast.success('Deleting offsets - done', { id: toastId });

      const remainingOffsets = group.topicOffsets.sum((t) => t.partitionOffsets.length) - activeOffsets.length;
      onClose();
      if (remainingOffsets === 0) {
        // Group is fully deleted, go back to list
        appGlobal.historyReplace('/groups');
      }
    } catch (err) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error(err);
      sonnerToast.error(`Could not delete selected offsets in consumer group ${group.groupId} - ${toJson(err, 4)}`, {
        id: toastId,
      });
    } finally {
      setIsDeleting(false);
      api.refreshConsumerGroups(true);
    }
  };

  const leadText =
    mode === 'group'
      ? 'This action will delete the following consumer group:'
      : mode === 'topic'
        ? 'Group offsets will be deleted for topic:'
        : 'Group offsets will be deleted for partition:';

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!(open || isDeleting)) {
          onClose();
        }
      }}
      open={visible}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {mode === 'group' ? 'Delete consumer group' : 'Delete consumer group offsets'}
          </AlertDialogTitle>
          <AlertDialogDescription>{leadText}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-destructive text-white">
            <TrashIcon size={20} />
          </div>
          <div className="flex flex-col gap-1 text-sm">
            {mode === 'group' && (
              <>
                <p>
                  <span className="font-bold">Name:</span> {group.groupId}
                </p>
                <p>
                  <span className="font-bold">Partitions:</span> {activeOffsets.length}
                </p>
                <p>
                  <span className="font-bold">Topics:</span> {offsetsByTopic.length}
                </p>
                <p>Are you sure?</p>
              </>
            )}

            {mode === 'topic' && (
              <>
                <p>
                  Topic: <InlineCode>{offsetsByTopic[0]?.topicName}</InlineCode>
                </p>
                <p className="font-semibold">
                  {activeOffsets.length} {singlePartition ? 'Partition' : 'Partitions'}
                </p>
              </>
            )}

            {mode === 'partition' && (
              <>
                <p>
                  Topic: <InlineCode>{offsetsByTopic[0]?.topicName}</InlineCode>
                </p>
                <p>
                  Partition: <InlineCode>{offsetsByTopic[0]?.items[0].partitionId}</InlineCode>
                </p>
              </>
            )}
          </div>
        </div>

        <AlertDialogFooter className="-mx-6 -mb-6 border-border border-t border-solid px-6 pt-4 pb-6">
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <UiButton
            data-testid="delete-offsets-confirm-button"
            isLoading={isDeleting}
            onClick={handleDelete}
            variant="destructive"
          >
            Delete
          </UiButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

// Utility functions
function createEditRequest(offsets: GroupOffset[]): EditConsumerGroupOffsetsTopic[] {
  const getOffset = (x: GroupOffset['newOffset']): number | undefined => {
    // no offset set
    if (x === null) {
      return;
    }

    // from other group
    if (typeof x === 'number') {
      return x;
    }

    // from timestamp
    if (x && typeof x === 'object' && 'offset' in x) {
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
    t.partitions = t.partitions.filter((p) => p.offset != null);
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
  return cleanOffsets.filter((t) => t.partitions.length > 0);
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
  return topicOffsets.filter((t) => t.partitions.length > 0);
}
