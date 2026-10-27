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

import { useQueryClient } from '@tanstack/react-query';
import type { SortingState } from '@tanstack/react-table';
import { ChevronLeftIcon, ChevronRightIcon, SkipIcon, TrashIcon, WarningIcon } from 'components/icons';
import { Component, type ReactNode, useRef, useState } from 'react';
import { toast } from 'sonner';
import { columnMeta, readColumnMeta } from 'utils/data-table-column-meta';

import { withProgressToast } from './with-progress-toast';
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
import { simpleUniqueId } from '../../../utils/utils';
import { showErrorModal } from '../../misc/error-modal';
import { KowlTimePicker } from '../../misc/kowl-time-picker';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../redpanda-ui/components/accordion';
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../redpanda-ui/components/alert-dialog';
import { Button as UiButton } from '../../redpanda-ui/components/button';
import { type DataTableColumnDef, DataTableColumnHeader, useDataTable } from '../../redpanda-ui/components/data-table';
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
import { TonedIcon } from '../shared/toned-icon';

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
  // Class component: generate the per-instance id prefix once instead of `useId()`.
  readonly fieldId = simpleUniqueId('edit-offsets');
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
            <Label htmlFor={`${this.fieldId}-topic`}>Topic</Label>
            <Select
              onValueChange={(v) => this.setState({ selectedTopic: v === ALL_SENTINEL ? null : v })}
              value={this.state.selectedTopic ?? ALL_SENTINEL}
            >
              <SelectTrigger id={`${this.fieldId}-topic`}>
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
              <Label htmlFor={`${this.fieldId}-partition`}>Partition</Label>
              <Select
                onValueChange={(v) => this.setState({ selectedPartition: v === ALL_SENTINEL ? null : Number(v) })}
                value={this.state.selectedPartition === null ? ALL_SENTINEL : String(this.state.selectedPartition)}
              >
                <SelectTrigger id={`${this.fieldId}-partition`}>
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
            <Label htmlFor={`${this.fieldId}-strategy`}>Strategy</Label>
            <Select
              disabled={this.state.isLoadingTimestamps}
              onValueChange={(v) => this.setState({ selectedOption: v as EditOptions })}
              value={this.state.selectedOption}
            >
              <SelectTrigger id={`${this.fieldId}-strategy`}>
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
          <fieldset className="mt-2 flex max-w-[300px] flex-col gap-1">
            <legend className="mb-1 text-label">Timestamp</legend>
            <KowlTimePicker
              disabled={this.state.isLoadingTimestamps}
              onChange={(t) => {
                this.setState({ timestampUtcMs: t });
              }}
              valueUtcMs={this.state.timestampUtcMs}
            />
          </fieldset>
        )}

        {this.state.selectedOption === 'shiftBy' && (
          <div className="mt-2 flex max-w-[300px] flex-col gap-1">
            <Label htmlFor={`${this.fieldId}-shift-by`}>Shift by</Label>
            <Input
              id={`${this.fieldId}-shift-by`}
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
              <div className="flex items-center gap-2 text-body">
                <RadioGroupItem id={`${this.fieldId}-copy-only-existing`} value="onlyExisting" />
                <label className="cursor-pointer" htmlFor={`${this.fieldId}-copy-only-existing`}>
                  <InfoTooltip text="Will only lookup the offsets for the topics/partitions that are defined in this group. If the other group has offsets for some additional topics/partitions they will be ignored.">
                    Copy matching offsets
                  </InfoTooltip>
                </label>
              </div>
              <div className="flex items-center gap-2 text-body">
                <RadioGroupItem id={`${this.fieldId}-copy-all`} value="all" />
                <label className="cursor-pointer" htmlFor={`${this.fieldId}-copy-all`}>
                  <InfoTooltip text="If the selected group has offsets for some topics/partitions that don't exist in the current consumer group, they will be copied anyway.">
                    Full Copy
                  </InfoTooltip>
                </label>
              </div>
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
              <AccordionTrigger>
                <div className="flex flex-1 items-center gap-1 font-semibold">
                  <span className="truncate pr-8">{topicName}</span>
                  <span className="ml-auto px-4">{items.length} Partitions</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <OffsetPreviewTable items={items} selectedTime={this.state.timestampUtcMs} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    );
  }

  setPage(page: 0 | 1) {
    if (page === 1) {
      // compute and set newOffset
      if (this.props.offsets === null) {
        return;
      }
      this.computeNewOffsets(this.props.offsets);
    }

    this.setState({ page });
  }

  computeNewOffsets(offsets: GroupOffset[]) {
    // reset all newOffset
    for (const x of offsets) {
      x.newOffset = undefined;
    }

    // filter selected offsets to be edited
    const selectedOffsets = offsets.filter(
      (x) => this.state.selectedPartition === null || x.partitionId === this.state.selectedPartition
    );

    const strategies: Record<EditOptions, () => void> = {
      // Earliest
      startOffset: () => assignNewOffset(selectedOffsets, -2),
      // Latest
      endOffset: () => assignNewOffset(selectedOffsets, -1),
      shiftBy: () => shiftOffsets(selectedOffsets, this.state.offsetShiftByValue),
      time: () => this.computeOffsetsForTimestamp(selectedOffsets),
      otherGroup: () => this.copyOffsetsFromOtherGroup(selectedOffsets, offsets),
    };
    strategies[this.state.selectedOption]();
  }

  computeOffsetsForTimestamp(selectedOffsets: GroupOffset[]) {
    for (const x of selectedOffsets) {
      x.newOffset = 'fetching offsets...' as string & number;
    }
    const requiredTopics = selectedOffsets.map((x) => x.topicName).distinct();

    // Fetch offset for each partition
    setTimeout(() => this.loadOffsetsForTimestamp(requiredTopics, selectedOffsets));
  }

  async loadOffsetsForTimestamp(requiredTopics: string[], selectedOffsets: GroupOffset[]) {
    let offsetsForTimestamp: TopicOffset[];
    try {
      offsetsForTimestamp = await withProgressToast('Fetching offsets for timestamp', () =>
        api.getTopicOffsetsByTimestamp(requiredTopics, this.state.timestampUtcMs)
      );
    } catch (err) {
      showErrorModal(
        'Failed to fetch offsets for timestamp',
        <span>
          Could not lookup offsets for given timestamp{' '}
          <span className="codeBox">{new Date(this.state.timestampUtcMs).toUTCString()}</span>.
        </span>,
        toJson({ errors: err, request: requiredTopics }, 4)
      );
      return;
    }

    assignTimestampOffsets(selectedOffsets, offsetsForTimestamp);
    // Trigger re-render so ColAfter sees updated newOffset values
    this.forceUpdate();
  }

  copyOffsetsFromOtherGroup(selectedOffsets: GroupOffset[], currentOffsets: GroupOffset[]) {
    // Lookup offsets from the other group
    const other = api.consumerGroups.get(this.state.selectedGroup ?? '');
    if (!other) {
      showErrorModal(
        'Consumer group not found',
        null,
        <span>
          Could not find a consumer group named <span className="codeBox">{this.state.selectedGroup}</span> to compute
          new offsets.
        </span>
      );
      return;
    }

    //
    // Copy offsets that exist in the current group from the other group
    for (const x of selectedOffsets) {
      x.newOffset = groupOffsetOf(other, x.topicName, x.partitionId);
    }

    //
    // Extend our offsets with any offsets that our group currently doesn't have
    if (this.state.otherGroupCopyMode === 'all') {
      appendMissingOffsets(currentOffsets, other);
    }
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
        api.refreshPartitions(topics, true).catch((error: unknown) => {
          toast.error('Failed to load partition offsets', { description: String(error) });
        });

        // reset settings
        this.setState({ page: 0, selectedOption: 'startOffset' });
      });
    }

    this.lastVisible = visible;
  }

  /** The offsets in the selected topic and partition (null selects all). */
  offsetsToApply(): GroupOffset[] {
    // biome-ignore lint/style/noNonNullAssertion: not touching MobX observables
    return this.props.offsets!.filter(
      ({ topicName, partitionId }) =>
        (this.state.selectedTopic === null || topicName === this.state.selectedTopic) &&
        (this.state.selectedPartition === null || partitionId === this.state.selectedPartition)
    );
  }

  async onApplyEdit() {
    const group = this.props.group;
    const topics = createEditRequest(this.offsetsToApply());

    this.setState({ isApplyingEdit: true });
    try {
      await withProgressToast('Applying offsets', () => applyOffsetEdit(group.groupId, topics));
    } catch (err) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('failed to apply offset edit', err);
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

/** A faded skip icon whose tooltip explains why there is no offset value. */
const SkipIconTooltip = ({ text }: { text: string }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="ml-0.5 inline-flex opacity-60">
            <SkipIcon size={16} />
          </span>
        }
      />
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

const unknownNewOffsetText = (val: unknown) => `Unknown type in 'newOffset' type='${typeof val}' value='{v}'`;

/** An offset with a muted note on where it came from, such as "(Earliest)" or the message timestamp. */
const OffsetWithNote = ({ offset, note }: { offset: ReactNode; note: ReactNode }) => (
  <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
    <span>{offset}</span>
    <span
      style={{
        fontSize: 'smaller',
        color: 'var(--color-subtle)',
        userSelect: 'none',
        cursor: 'default',
      }}
    >
      ({note})
    </span>
  </div>
);

/** New offset set by timestamp: a Date placeholder while loading, then the fetched partition offset. */
const TimestampNewOffset = ({
  record,
  val,
  selectedTime,
}: {
  record: GroupOffset;
  val: Date | PartitionOffset;
  selectedTime?: number;
}) => {
  // placeholder while loading
  if (val instanceof Date) {
    return val.toLocaleString();
  }

  // anything but a fetched partition offset
  if (!('offset' in val)) {
    return unknownNewOffsetText(val);
  }

  // error
  if (val.error) {
    return <span style={{ color: 'orangered' }}>{val.error}</span>;
  }

  // successful fetch
  if (val.timestamp > 0) {
    return (
      <OffsetWithNote note={new Date(val.timestamp).toLocaleString()} offset={numberToThousandsString(val.offset)} />
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
              <TonedIcon icon={WarningIcon} size={14} tone="destructive" />
              <span>{numberToThousandsString(partition?.waterMarkHigh ?? -1)}</span>
            </span>
          }
        />
        <TooltipContent className="max-w-[350px]">
          There is no offset for this partition at or after the given timestamp (
          <code>{new Date(selectedTime ?? 0).toLocaleString()}</code>). As a fallback, the last offset in that partition
          will be used.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

/** New offset copied from another group (a concrete offset), or Earliest (-2) / Latest (-1). */
const NumericNewOffset = ({ record, val }: { record: GroupOffset; val: number }) => {
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
    <OffsetWithNote
      note={content.name}
      offset={typeof content.offset === 'number' ? numberToThousandsString(content.offset) : content.offset}
    />
  );
};

class ColAfter extends Component<{
  selectedTime?: number;
  record: GroupOffset;
}> {
  render() {
    const val = this.props.record.newOffset;

    // No change
    if (val === null) {
      return <SkipIconTooltip text="Offset will not be changed" />;
    }

    // Set by timestamp
    if (typeof val === 'object') {
      return <TimestampNewOffset record={this.props.record} selectedTime={this.props.selectedTime} val={val} />;
    }

    // Earliest / Latest / OtherGroup
    if (typeof val === 'number') {
      return <NumericNewOffset record={this.props.record} val={val} />;
    }

    // Loading placeholder
    if (typeof val === 'string') {
      return <span style={{ opacity: 0.66, fontStyle: 'italic' }}>{val}</span>;
    }

    return unknownNewOffsetText(val);
  }
}

/** Page-2 preview of a single topic's partition offsets (Before/After). */
const OffsetPreviewTable = ({ items, selectedTime }: { items: GroupOffset[]; selectedTime: number }) => {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns: DataTableColumnDef<GroupOffset>[] = [
    {
      accessorKey: 'partitionId',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Partition" />,
      meta: columnMeta({ headWidth: 'sm' as const }),
    },
    {
      accessorKey: 'offset',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Offset Before" />,
      meta: columnMeta({ headWidth: 'md' as const }),
      cell: ({
        row: {
          original: { offset },
        },
      }) =>
        offset === null || offset === undefined ? (
          <SkipIconTooltip text="The group does not have an offset for this partition yet" />
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

  const table = useDataTable({
    data: items,
    columns,
    enableHiding: false,
    enableRowSelection: false,
    state: { sorting },
    onSortingChange: setSorting,
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const meta = readColumnMeta(header.column.columnDef.meta);
              return (
                <TableHead key={header.id} width={meta?.headWidth}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
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
              <TableCell key={cell.id}>{<table.FlexRender cell={cell} />}</TableCell>
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
const DELETE_LEAD_TEXT: Record<GroupDeletingMode, string> = {
  group: 'This action will delete the following consumer group:',
  topic: 'Group offsets will be deleted for topic:',
  partition: 'Group offsets will be deleted for partition:',
};

/** The latest non-null offsets, so the dialog content doesn't flash empty during the close animation. */
const useLastOffsets = (offsets: GroupOffset[] | null): GroupOffset[] => {
  const lastOffsetsRef = useRef<GroupOffset[]>([]);
  if (offsets) {
    lastOffsetsRef.current = offsets;
  }
  return offsets ?? lastOffsetsRef.current;
};

/** Deletes the whole group in `group` mode, otherwise only the given offsets. Throws if the backend reports partition errors. */
async function deleteGroupOrOffsets(group: GroupDescription, mode: GroupDeletingMode, offsets: GroupOffset[]) {
  if (mode === 'group') {
    await api.deleteConsumerGroup(group.groupId);
    return;
  }

  const deleteRequest = createDeleteRequest(offsets);
  const deleteResponse = await api.deleteConsumerGroupOffsets(group.groupId, deleteRequest);
  const errors = topicsWithPartitionErrors(deleteResponse);
  if (errors.length > 0) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error('backend returned errors for deleteOffsets', {
      request: deleteRequest,
      errors,
    });
    throw new Error(`Delete offsets failed with ${errors.length} errors`);
  }
}

/** Whether deleting `offsets` leaves the group without any committed offsets. */
const deletesAllOffsets = (group: GroupDescription, offsets: GroupOffset[]) =>
  group.topicOffsets.sum((t) => t.partitionOffsets.length) - offsets.length === 0;

const useDeleteOffsets = ({
  group,
  mode,
  activeOffsets,
  onClose,
}: {
  group: GroupDescription;
  mode: GroupDeletingMode;
  activeOffsets: GroupOffset[];
  onClose: () => void;
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await withProgressToast(
        'Deleting offsets',
        () => deleteGroupOrOffsets(group, mode, activeOffsets),
        (err) => `Could not delete selected offsets in consumer group ${group.groupId} - ${toJson(err, 4)}`
      );

      onClose();
      if (deletesAllOffsets(group, activeOffsets)) {
        // Group is fully deleted, go back to list
        appGlobal.historyReplace('/groups');
      }
    } catch (err) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error(err);
    } finally {
      setIsDeleting(false);
      // Returns nothing to await: its request failures land in the API error store.
      api.refreshConsumerGroups(true);
      // Caught here so a failed refresh can't replace the delete's own outcome or escape the click.
      await queryClient.invalidateQueries({ queryKey: ['consumer-groups'] }).catch((error: unknown) => {
        toast.error('Failed to refresh consumer groups', { description: String(error) });
      });
    }
  };

  return { isDeleting, handleDelete };
};

export const DeleteOffsetsModal = (props: {
  group: GroupDescription;
  mode: GroupDeletingMode;
  offsets: GroupOffset[] | null;
  onClose: () => void;
  onInit?: () => void;
}) => {
  const { group, mode, offsets, onClose } = props;
  const activeOffsets = useLastOffsets(offsets);
  const { isDeleting, handleDelete } = useDeleteOffsets({ group, mode, activeOffsets, onClose });

  const visible = Boolean(offsets);
  const offsetsByTopic = activeOffsets.groupInto((x) => x.topicName).map((g) => ({ topicName: g.key, items: g.items }));
  const singlePartition = activeOffsets.length === 1;

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
          <AlertDialogDescription>{DELETE_LEAD_TEXT[mode]}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogBody>
          <div className="flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-destructive text-destructive-foreground">
              <TrashIcon size={20} />
            </div>
            <div className="flex flex-col gap-1 text-body">
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
        </AlertDialogBody>

        {/* Following AlertDialogBody, the footer draws its own top border. */}
        <AlertDialogFooter>
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

type TopicPartitionResults = {
  topicName: string;
  partitions: { partitionID: number; error: string | undefined }[];
};

/** Keeps only the partitions that report an error, and only the topics that have any. */
function topicsWithPartitionErrors(topics: TopicPartitionResults[]): TopicPartitionResults[] {
  return topics
    .map((t) => ({
      ...t,
      partitions: t.partitions.filter((x) => x.error),
    }))
    .filter((t) => t.partitions.length > 0);
}

async function applyOffsetEdit(groupId: string, topics: EditConsumerGroupOffsetsTopic[]) {
  const editResponse = await api.editConsumerGroupOffsets(groupId, topics);
  const errors = topicsWithPartitionErrors(editResponse);
  if (errors.length > 0) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error('apply offsets, backend errors', { errors, request: topics });
    throw new Error(`Apply offsets failed with ${errors.length} errors`);
  }
}

function assignNewOffset(offsets: GroupOffset[], newOffset: number) {
  for (const x of offsets) {
    x.newOffset = newOffset;
  }
}

function shiftOffsets(offsets: GroupOffset[], shiftBy: number) {
  for (const x of offsets) {
    if (x.offset) {
      x.newOffset = x.offset + shiftBy;
    }
  }
}

function assignTimestampOffsets(offsets: GroupOffset[], offsetsForTimestamp: TopicOffset[]) {
  for (const x of offsets) {
    const responseOffset = offsetsForTimestamp
      .first((t) => t.topicName === x.topicName)
      ?.partitions.first((p) => p.partitionId === x.partitionId);
    x.newOffset = responseOffset;
  }
}

function groupOffsetOf(group: GroupDescription, topicName: string, partitionId: number): number | undefined {
  return (
    group.topicOffsets.first((t) => t.topic === topicName)?.partitionOffsets.first((p) => p.partitionId === partitionId)
      ?.groupOffset ?? undefined
  );
}

/** Appends every committed offset of `other` that `currentOffsets` doesn't have yet, as a new offset with no current one. */
function appendMissingOffsets(currentOffsets: GroupOffset[], other: GroupDescription) {
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
    if (!currentOffsets.any((x) => x.topicName === o.topicName && x.partitionId === o.partitionId)) {
      currentOffsets.push({
        topicName: o.topicName,
        partitionId: o.partitionId,
        offset: undefined,
        newOffset: o.offset,
      });
    }
  }
}
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
