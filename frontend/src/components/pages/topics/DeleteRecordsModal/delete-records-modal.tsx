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

import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Choicebox,
  ChoiceboxItem,
  ChoiceboxItemContent,
  ChoiceboxItemDescription,
  ChoiceboxItemHeader,
  ChoiceboxItemIndicator,
  ChoiceboxItemTitle,
} from 'components/redpanda-ui/components/choicebox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Input } from 'components/redpanda-ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Slider } from 'components/redpanda-ui/components/slider';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { List, ListItem, Text } from 'components/redpanda-ui/components/typography';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { api, useApiStoreHook } from '../../../../state/backend-api';
import type { DeleteRecordsResponseData, Partition, Topic } from '../../../../state/rest-interfaces';
import { prettyNumber } from '../../../../utils/utils';
import { range } from '../../../misc/common';
import { KowlTimePicker } from '../../../misc/kowl-time-picker';

type AllPartitions = 'allPartitions';
type SpecificPartition = 'specificPartition';
type PartitionOption = null | AllPartitions | SpecificPartition;

const DIGITS_ONLY_REGEX = /^\d*$/;

function TrashIcon() {
  return (
    <svg className="shrink-0" fill="none" height="67" width="66" xmlns="http://www.w3.org/2000/svg">
      <title>Trash</title>
      <circle cx="33" cy="33.6" fill="#F53649" r="33" />
      <path
        d="M18.806 24.729h28.388M29.452 31.826V42.47M36.548 31.826V42.47M20.58 24.729l1.775 21.29a3.548 3.548 0 003.548 3.549h14.194a3.548 3.548 0 003.548-3.549l1.774-21.29"
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.333"
      />
      <path
        d="M27.677 24.729v-5.322a1.774 1.774 0 011.775-1.775h7.096a1.774 1.774 0 011.774 1.774v5.323"
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.333"
      />
    </svg>
  );
}

function DeleteRecordsIntro({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <TrashIcon />
      <Text variant="muted">{children}</Text>
    </div>
  );
}

function DeleteOption({
  value,
  title,
  subTitle,
  isSelected,
  children,
}: {
  value: string;
  title: string;
  subTitle: string;
  isSelected: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <ChoiceboxItem value={value}>
        <ChoiceboxItemHeader>
          <ChoiceboxItemTitle>{title}</ChoiceboxItemTitle>
          <ChoiceboxItemDescription>{subTitle}</ChoiceboxItemDescription>
        </ChoiceboxItemHeader>
        <ChoiceboxItemContent>
          <ChoiceboxItemIndicator />
        </ChoiceboxItemContent>
      </ChoiceboxItem>
      {isSelected && children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function SelectPartitionStep({
  selectedPartitionOption,
  onPartitionOptionSelected,
  onPartitionSpecified: onSpecificPartitionSelected,
  specificPartition,
  partitions,
}: {
  selectedPartitionOption: PartitionOption;
  onPartitionOptionSelected: (v: PartitionOption) => void;
  onPartitionSpecified: (v: number | null) => void;
  specificPartition: number | null;
  partitions: number[];
}): JSX.Element {
  return (
    <div className="space-y-4">
      <DeleteRecordsIntro>
        You are about to delete records in your topic. Choose on what partitions you want to delete records. In the next
        step you can choose the new low water mark for your selected partitions.
      </DeleteRecordsIntro>
      <Choicebox
        onValueChange={(v) => {
          const option = v as PartitionOption;
          if (option === 'allPartitions') {
            onSpecificPartitionSelected(null);
          }
          onPartitionOptionSelected(option);
        }}
        value={selectedPartitionOption ?? ''}
      >
        <DeleteOption
          isSelected={selectedPartitionOption === 'allPartitions'}
          subTitle="Delete records until specified offset across all available partitions in this topic."
          title="All Partitions"
          value="allPartitions"
        />
        <DeleteOption
          isSelected={selectedPartitionOption === 'specificPartition'}
          subTitle="Delete records within a specific partition in this topic only."
          title="Specific Partition"
          value="specificPartition"
        >
          <Select
            onValueChange={(v) => onSpecificPartitionSelected(Number(v))}
            value={specificPartition === null ? undefined : String(specificPartition)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose Partition…">
                {(raw) => (raw === undefined || raw === '' ? 'Choose Partition…' : `Partition ${raw}`)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {partitions.map((i) => (
                <SelectItem key={i} value={String(i)}>
                  Partition {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DeleteOption>
      </Choicebox>
    </div>
  );
}

type OffsetOption = null | 'highWatermark' | 'manualOffset' | 'timestamp';
type PartitionInfo = [SpecificPartition, number] | AllPartitions;

const SelectOffsetStep = ({
  onOffsetOptionSelected: selectValue,
  offsetOption: selectedValue,
  topicName,
  partitionInfo,
  onOffsetSpecified,
  timestamp,
  onTimestampChanged,
}: {
  topicName: string;
  offsetOption: OffsetOption;
  onOffsetOptionSelected: (v: OffsetOption) => void;
  partitionInfo: PartitionInfo;
  onOffsetSpecified: (v: number) => void;
  timestamp: number | null;
  onTimestampChanged: (v: number) => void;
}) => {
  const isAllPartitions = partitionInfo === 'allPartitions';

  return (
    <div className="space-y-4">
      <DeleteRecordsIntro>
        Choose the new low offset for your selected partitions. Take note that this is a soft delete and that the actual
        data may still be on the hard drive but not visible for any clients, even if they request the data.
      </DeleteRecordsIntro>
      <Choicebox onValueChange={(v) => selectValue(v as OffsetOption)} value={selectedValue ?? ''}>
        {isAllPartitions ? (
          <DeleteOption
            isSelected={selectedValue === 'highWatermark'}
            subTitle="Delete records until high watermark across all partitions in this topic."
            title="High Watermark"
            value="highWatermark"
          />
        ) : (
          <DeleteOption
            isSelected={selectedValue === 'manualOffset'}
            subTitle={`Delete records until specified offset across all selected partitions (ID: ${partitionInfo[1]}) in this topic.`}
            title="Manual Offset"
            value="manualOffset"
          >
            <ManualOffsetContent
              onOffsetSpecified={onOffsetSpecified}
              partitionInfo={partitionInfo}
              topicName={topicName}
            />
          </DeleteOption>
        )}
        <DeleteOption
          isSelected={selectedValue === 'timestamp'}
          subTitle="Delete all records prior to the selected timestamp."
          title="Timestamp"
          value="timestamp"
        >
          <KowlTimePicker onChange={onTimestampChanged} valueUtcMs={timestamp ?? 0} />
        </DeleteOption>
      </Choicebox>
    </div>
  );
};

const ManualOffsetContent = ({
  topicName,
  onOffsetSpecified,
  partitionInfo,
}: {
  topicName: string;
  partitionInfo: PartitionInfo;
  onOffsetSpecified: (v: number) => void;
}) => {
  const [sliderValue, setSliderValue] = useState(0);
  const topicPartitionErrors = useApiStoreHook((s) => s.topicPartitionErrors.get(topicName));
  const topicWatermarksErrors = useApiStoreHook((s) => s.topicWatermarksErrors.get(topicName));
  const partitions = useApiStoreHook((s) => s.topicPartitions.get(topicName));

  const updateOffsetFromSlider = (v: number) => {
    setSliderValue(v);
    onOffsetSpecified(v);
  };

  if (topicPartitionErrors || topicWatermarksErrors) {
    const partitionErrors = topicPartitionErrors?.map(({ partitionError }) => (
      <li key={`${topicName}-${partitionError}`}>{partitionError}</li>
    ));
    const waterMarksErrors = topicWatermarksErrors?.map(({ waterMarksError }) => (
      <li key={`${topicName}-${waterMarksError}`}>{waterMarksError}</li>
    ));
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {partitionErrors && partitionErrors.length > 0 ? (
            <>
              <strong>Partition Errors:</strong>
              <ul>{partitionErrors}</ul>
            </>
          ) : null}
          {waterMarksErrors && waterMarksErrors.length > 0 ? (
            <>
              <strong>Watermarks Errors:</strong>
              <ul>{waterMarksErrors}</ul>
            </>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

  if (!partitions) {
    return <Spinner className="size-6" />;
  }

  const [, partitionId] = partitionInfo;
  const partition = partitions.find((p) => p.id === partitionId);

  if (!partition) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{`Partition of topic ${topicName} with ID ${partitionId} not found!`}</AlertDescription>
      </Alert>
    );
  }

  const { marks, min, max } = getMarks(partition);
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <Slider max={max} min={min} onValueChange={([v]) => updateOffsetFromSlider(v)} value={sliderValue} />
        {marks ? (
          <div className="mt-1 flex justify-between">
            {Object.values(marks).map((label) => (
              <Text key={label} variant="captionMedium">
                {label}
              </Text>
            ))}
          </div>
        ) : null}
      </div>
      <Input
        className="max-w-[124px]"
        onBlur={() => {
          if (sliderValue < min) {
            updateOffsetFromSlider(min);
          } else if (sliderValue > max) {
            updateOffsetFromSlider(max);
          } else {
            updateOffsetFromSlider(sliderValue);
          }
        }}
        onChange={(e) => {
          const { value } = e.target;
          if (!DIGITS_ONLY_REGEX.test(value)) {
            return;
          }
          updateOffsetFromSlider(Number(value));
        }}
        value={sliderValue}
      />
    </div>
  );
};

function getMarks(partition: Partition) {
  if (!partition) {
    return {
      min: 0,
      max: Number.POSITIVE_INFINITY,
    };
  }

  const diff = partition.waterMarkHigh - partition.waterMarkLow;

  let marks: number[] = [];

  if (diff > 0) {
    marks = [partition.waterMarkLow, partition.waterMarkLow];
  }

  if (diff > 100) {
    marks = [
      partition.waterMarkLow,
      partition.waterMarkLow + diff * 0.33,
      partition.waterMarkLow + diff * 0.67,
      partition.waterMarkHigh,
    ];
  }

  return {
    min: partition.waterMarkLow,
    max: partition.waterMarkHigh,
    marks: formatMarks(marks),
  };
}

function formatMarks(marks: number[]) {
  return marks.reduce(
    (acc, it) => {
      const key = it.toFixed(0);
      const value = prettyNumber(it);
      acc[key] = value;
      return acc;
    },
    {} as { [index: string]: string }
  );
}

type DeleteRecordsModalProps = {
  topic: Topic | undefined | null;
  visible: boolean;
  onCancel: () => void;
  onFinish: () => void;
  afterClose: () => void;
};

export default function DeleteRecordsModal(props: DeleteRecordsModalProps): JSX.Element | null {
  const { visible, topic, onCancel, onFinish } = props;

  useEffect(() => {
    if (topic?.topicName) {
      api.refreshPartitionsForTopic(topic.topicName, true);
    }
  }, [topic?.topicName]);

  const [wizardState, setWizardState] = useState(() => ({
    partitionOption: null as PartitionOption,
    specifiedPartition: null as null | number,
    offsetOption: null as OffsetOption,
    step: 1 as 1 | 2,
    specifiedOffset: 0,
    timestamp: Date.now(),
  }));
  const { partitionOption, specifiedPartition, offsetOption, step, specifiedOffset, timestamp } = wizardState;
  const setPartitionOption = (v: PartitionOption) => setWizardState((prev) => ({ ...prev, partitionOption: v }));
  const setSpecifiedPartition = (v: null | number) => setWizardState((prev) => ({ ...prev, specifiedPartition: v }));
  const setOffsetOption = (v: OffsetOption) => setWizardState((prev) => ({ ...prev, offsetOption: v }));
  const setStep = (v: 1 | 2) => setWizardState((prev) => ({ ...prev, step: v }));
  const setSpecifiedOffset = (v: number) => setWizardState((prev) => ({ ...prev, specifiedOffset: v }));
  const setTimestamp = (v: number) => setWizardState((prev) => ({ ...prev, timestamp: v }));
  const [okButtonLoading, setOkButtonLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<string[]>([]);

  const hasErrors = errors.length > 0;
  const isAllPartitions = partitionOption === 'allPartitions';
  const isSpecficPartition = partitionOption === 'specificPartition';
  const isManualOffset = offsetOption === 'manualOffset';
  const isHighWatermark = offsetOption === 'highWatermark';
  const isTimestamp = offsetOption === 'timestamp';

  // biome-ignore lint/suspicious/noConfusingVoidType: needed to fix error TS2345
  const handleFinish = (responseData: void | DeleteRecordsResponseData | null | undefined) => {
    if (responseData === null || responseData === undefined || typeof responseData === 'undefined') {
      setErrors(['You are not allowed to delete records on this topic. Contact your Kafka administrator.']);
      return;
    }

    const errorPartitions = responseData.partitions.filter((partition) => !!partition.error);

    if (errorPartitions.length > 0) {
      setErrors(errorPartitions.map(({ partitionId, error }) => `Partition ${partitionId}: ${error}`));
      setOkButtonLoading(false);
    } else {
      onFinish();
      toast.success('Records deleted');
    }
  };

  if (!topic) {
    return null;
  }

  const isOkButtonDisabled = () => {
    if (hasErrors) {
      return false;
    }

    if (step === 1) {
      return partitionOption === null || (isSpecficPartition && specifiedPartition === null);
    }

    if (step === 2) {
      return offsetOption === null || (isTimestamp && timestamp === null);
    }

    return offsetOption === null;
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
  const onOk = () => {
    if (!topic) {
      return;
    }

    const topicName = topic.topicName;

    if (hasErrors) {
      onFinish();
    }

    if (step === 1) {
      setStep(2);
      return;
    }

    setOkButtonLoading(true);

    if (isAllPartitions && isHighWatermark) {
      api.deleteTopicRecordsFromAllPartitionsHighWatermark(topicName)?.then(handleFinish);
    } else if (isSpecficPartition && isManualOffset) {
      // biome-ignore lint/style/noNonNullAssertion: not touching MobX observables
      api.deleteTopicRecords(topicName, specifiedOffset, specifiedPartition!)?.then(handleFinish);
    } else if (isTimestamp && timestamp !== null) {
      api.getTopicOffsetsByTimestamp([topicName], timestamp).then((topicOffsets) => {
        if (isAllPartitions) {
          const pairs = topicOffsets[0].partitions.map(({ partitionId, offset }) => ({
            partitionId,
            offset,
          }));
          api.deleteTopicRecordsFromMultiplePartitionOffsetPairs(topicName, pairs)?.then(handleFinish);
        } else if (isSpecficPartition) {
          const partitionOffset = topicOffsets[0].partitions.find((p) => specifiedPartition === p.partitionId)?.offset;

          if (partitionOffset !== null && partitionOffset !== undefined) {
            // biome-ignore lint/style/noNonNullAssertion: not touching MobX observables
            api.deleteTopicRecords(topicName, partitionOffset, specifiedPartition!)?.then(handleFinish);
          } else {
            setErrors(['No partition offset was specified. Contact your administrator.']);
          }
        }
      });
    } else {
      setErrors(['Something went wrong. Contact your administrator.']);
    }
  };

  const getPartitionInfo = (): PartitionInfo => {
    if (specifiedPartition !== null && partitionOption === 'specificPartition') {
      return ['specificPartition', specifiedPartition];
    }
    return 'allPartitions';
  };

  const okButtonLabel = (() => {
    if (hasErrors) {
      return 'Ok';
    }
    if (step === 1) {
      return 'Choose End Offset';
    }
    return 'Delete Records';
  })();

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
      open={visible}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Delete records in topic</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {hasErrors ? (
            <Alert variant="destructive">
              <AlertDescription>
                <div className="flex flex-col gap-4">
                  <Text>Errors occurred while processing your request. Contact your Kafka administrator.</Text>
                  <List>
                    {errors.map((e) => (
                      <ListItem key={e}>{e}</ListItem>
                    ))}
                  </List>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}
          {!hasErrors && step === 1 ? (
            <SelectPartitionStep
              onPartitionOptionSelected={setPartitionOption}
              onPartitionSpecified={setSpecifiedPartition}
              partitions={range(0, topic.partitionCount)}
              selectedPartitionOption={partitionOption}
              specificPartition={specifiedPartition}
            />
          ) : null}
          {!hasErrors && step === 2 && partitionOption !== null ? (
            <SelectOffsetStep
              offsetOption={offsetOption}
              onOffsetOptionSelected={setOffsetOption}
              onOffsetSpecified={setSpecifiedOffset}
              onTimestampChanged={setTimestamp}
              partitionInfo={getPartitionInfo()}
              timestamp={timestamp}
              topicName={topic.topicName}
            />
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            disabled={isOkButtonDisabled()}
            isLoading={okButtonLoading}
            onClick={onOk}
            variant={hasErrors ? 'secondary' : 'destructive'}
          >
            {okButtonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
