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
import { defineStepper } from 'components/redpanda-ui/components/stepper';
import { List, ListItem } from 'components/redpanda-ui/components/typography';
import { type JSX, useEffect, useState } from 'react';
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

const { Stepper } = defineStepper(
  { id: 'partitions', title: 'Select partitions' },
  { id: 'offset', title: 'Choose offset' }
);

const createInitialWizardState = () => ({
  partitionOption: null as PartitionOption,
  specifiedPartition: null as null | number,
  offsetOption: null as OffsetOption,
  specifiedOffset: 0,
  timestamp: Date.now(),
});

function TrashIcon() {
  return (
    <svg className="shrink-0" fill="none" height="67" width="66" xmlns="http://www.w3.org/2000/svg">
      <title>Trash</title>
      <circle cx="33" cy="33.6" fill="var(--color-destructive)" r="33" />
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
      <p className="text-body text-muted-foreground">{children}</p>
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
      {isSelected && children ? <div className="mt-2 border-l-2 border-l-selected py-2 pl-5">{children}</div> : null}
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
          } else if (option === 'specificPartition' && specificPartition === null) {
            // Preselect the first partition so the dropdown isn't empty and the user can proceed.
            onSpecificPartitionSelected(partitions[0] ?? null);
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
                {(raw) => (raw === undefined || raw === null || raw === '' ? 'Choose Partition…' : `Partition ${raw}`)}
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
  const topicPartitionErrors = useApiStoreHook((s) => s.topicPartitionErrors.get(topicName));
  const topicWatermarksErrors = useApiStoreHook((s) => s.topicWatermarksErrors.get(topicName));
  const partitions = useApiStoreHook((s) => s.topicPartitions.get(topicName));

  if (topicPartitionErrors || topicWatermarksErrors) {
    return (
      <PartitionErrorsAlert
        topicName={topicName}
        topicPartitionErrors={topicPartitionErrors}
        topicWatermarksErrors={topicWatermarksErrors}
      />
    );
  }

  if (!partitions) {
    return <Spinner className="size-6" />;
  }

  return (
    <ManualOffsetPartition
      onOffsetSpecified={onOffsetSpecified}
      partitionId={partitionInfo[1]}
      partitions={partitions}
      topicName={topicName}
    />
  );
};

const PartitionErrorsAlert = ({
  topicName,
  topicPartitionErrors,
  topicWatermarksErrors,
}: {
  topicName: string;
  topicPartitionErrors: { partitionError: string }[] | undefined;
  topicWatermarksErrors: { waterMarksError: string }[] | undefined;
}) => {
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
};

const ManualOffsetPartition = ({
  topicName,
  partitions,
  partitionId,
  onOffsetSpecified,
}: {
  topicName: string;
  partitions: Partition[];
  partitionId: PartitionInfo[1];
  onOffsetSpecified: (v: number) => void;
}) => {
  const partition = partitions.find((p) => p.id === partitionId);

  if (!partition) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{`Partition of topic ${topicName} with ID ${partitionId} not found!`}</AlertDescription>
      </Alert>
    );
  }

  return <ManualOffsetSlider key={partition.id} onOffsetSpecified={onOffsetSpecified} partition={partition} />;
};

const ManualOffsetSlider = ({
  partition,
  onOffsetSpecified,
}: {
  partition: Partition;
  onOffsetSpecified: (v: number) => void;
}) => {
  const { marks, min, max } = getMarks(partition);
  // Default to the partition's low watermark — offset 0 is below the valid range.
  const [sliderValue, setSliderValue] = useState(min);

  // Report the low-watermark default to the parent so submitting without moving the
  // slider uses a valid in-range value instead of 0.
  // biome-ignore lint/correctness/useExhaustiveDependencies: report the initial default once on mount
  useEffect(() => {
    onOffsetSpecified(min);
  }, []);

  const updateOffsetFromSlider = (v: number) => {
    setSliderValue(v);
    onOffsetSpecified(v);
  };

  return (
    <div className="flex items-start gap-4">
      <div className="flex-1 pt-2">
        <Slider max={max} min={min} onValueChange={([v]) => updateOffsetFromSlider(v)} value={sliderValue} />
        {marks ? (
          <div className="mt-2 flex justify-between">
            {Object.values(marks).map((label) => (
              <span className="text-caption text-muted-foreground" key={label}>
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex w-28 shrink-0 flex-col gap-1">
        <label className="text-caption text-muted-foreground" htmlFor="manual-offset-input">
          Offset
        </label>
        <Input
          className="w-full"
          id="manual-offset-input"
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

type WizardState = ReturnType<typeof createInitialWizardState>;
// biome-ignore lint/suspicious/noConfusingVoidType: needed to fix error TS2345
type DeleteRecordsResponse = void | DeleteRecordsResponseData | null | undefined;
type DeleteRecordsCallbacks = {
  onResponse: (responseData: DeleteRecordsResponse) => void;
  setErrors: (errors: string[]) => void;
};

function useDeleteRecordsWizard() {
  const [wizardState, setWizardState] = useState(createInitialWizardState);
  // Reset the offset choice whenever the partition selection changes — the available
  // offset options differ between all-partitions and a specific partition.
  const setPartitionOption = (v: PartitionOption) =>
    setWizardState((prev) => ({ ...prev, partitionOption: v, offsetOption: null }));
  const setSpecifiedPartition = (v: null | number) => setWizardState((prev) => ({ ...prev, specifiedPartition: v }));
  const setOffsetOption = (v: OffsetOption) => setWizardState((prev) => ({ ...prev, offsetOption: v }));
  const setSpecifiedOffset = (v: number) => setWizardState((prev) => ({ ...prev, specifiedOffset: v }));
  const setTimestamp = (v: number) => setWizardState((prev) => ({ ...prev, timestamp: v }));
  const resetWizard = () => setWizardState(createInitialWizardState());

  return {
    wizardState,
    setPartitionOption,
    setSpecifiedPartition,
    setOffsetOption,
    setSpecifiedOffset,
    setTimestamp,
    resetWizard,
  };
}

function deleteRecordsByTimestamp(
  topicName: string,
  timestamp: number,
  { partitionOption, specifiedPartition }: WizardState,
  { onResponse, setErrors }: DeleteRecordsCallbacks
) {
  api.getTopicOffsetsByTimestamp([topicName], timestamp).then((topicOffsets) => {
    if (partitionOption === 'allPartitions') {
      const pairs = topicOffsets[0].partitions.map(({ partitionId, offset }) => ({
        partitionId,
        offset,
      }));
      api.deleteTopicRecordsFromMultiplePartitionOffsetPairs(topicName, pairs)?.then(onResponse);
    } else if (partitionOption === 'specificPartition') {
      const partitionOffset = topicOffsets[0].partitions.find((p) => specifiedPartition === p.partitionId)?.offset;

      if (partitionOffset !== null && partitionOffset !== undefined) {
        // biome-ignore lint/style/noNonNullAssertion: not touching MobX observables
        api.deleteTopicRecords(topicName, partitionOffset, specifiedPartition!)?.then(onResponse);
      } else {
        setErrors(['No partition offset was specified. Contact your administrator.']);
      }
    }
  });
}

function requestRecordDeletion(topicName: string, state: WizardState, callbacks: DeleteRecordsCallbacks) {
  const { partitionOption, specifiedPartition, offsetOption, specifiedOffset, timestamp } = state;

  if (partitionOption === 'allPartitions' && offsetOption === 'highWatermark') {
    api.deleteTopicRecordsFromAllPartitionsHighWatermark(topicName)?.then(callbacks.onResponse);
  } else if (partitionOption === 'specificPartition' && offsetOption === 'manualOffset') {
    // biome-ignore lint/style/noNonNullAssertion: not touching MobX observables
    api.deleteTopicRecords(topicName, specifiedOffset, specifiedPartition!)?.then(callbacks.onResponse);
  } else if (offsetOption === 'timestamp' && timestamp !== null) {
    deleteRecordsByTimestamp(topicName, timestamp, state, callbacks);
  } else {
    callbacks.setErrors(['Something went wrong. Contact your administrator.']);
  }
}

function useDeleteRecordsSubmission(wizardState: WizardState, onFinish: () => void) {
  const [okButtonLoading, setOkButtonLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFinish = (responseData: DeleteRecordsResponse) => {
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

  const submitDelete = (topicName: string) => {
    setOkButtonLoading(true);
    requestRecordDeletion(topicName, wizardState, { onResponse: handleFinish, setErrors });
  };

  const resetSubmission = () => {
    setOkButtonLoading(false);
    setErrors([]);
  };

  return { okButtonLoading, errors, hasErrors: errors.length > 0, submitDelete, resetSubmission };
}

function isPrimaryDisabled(state: WizardState, hasErrors: boolean, isOffsetStep: boolean) {
  if (hasErrors) {
    return false;
  }

  if (isOffsetStep) {
    return state.offsetOption === null || (state.offsetOption === 'timestamp' && state.timestamp === null);
  }

  return (
    state.partitionOption === null ||
    (state.partitionOption === 'specificPartition' && state.specifiedPartition === null)
  );
}

function getPartitionInfo({ specifiedPartition, partitionOption }: WizardState): PartitionInfo {
  if (specifiedPartition !== null && partitionOption === 'specificPartition') {
    return ['specificPartition', specifiedPartition];
  }
  return 'allPartitions';
}

function getPrimaryLabel(hasErrors: boolean, isLast: boolean) {
  if (hasErrors) {
    return 'Ok';
  }
  return isLast ? 'Delete Records' : 'Choose End Offset';
}

export default function DeleteRecordsModal(props: DeleteRecordsModalProps): JSX.Element | null {
  const { visible, topic, onCancel, onFinish } = props;

  useEffect(() => {
    if (topic?.topicName) {
      api.refreshPartitionsForTopic(topic.topicName, true);
    }
  }, [topic?.topicName]);

  const { wizardState, resetWizard, ...wizardSetters } = useDeleteRecordsWizard();
  const { partitionOption, specifiedPartition, offsetOption, timestamp } = wizardState;
  const { okButtonLoading, errors, hasErrors, submitDelete, resetSubmission } = useDeleteRecordsSubmission(
    wizardState,
    onFinish
  );

  const handleClose = () => {
    resetWizard();
    resetSubmission();
    onCancel();
  };

  if (!topic) {
    return null;
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
      open={visible}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Delete records in topic</DialogTitle>
        </DialogHeader>
        <Stepper.Provider className="contents" variant="horizontal">
          {({ methods }) => {
            const isOffsetStep = methods.current.id === 'offset';
            return (
              <>
                <DialogBody>
                  {hasErrors ? (
                    <Alert variant="destructive">
                      <AlertDescription>
                        <div className="flex flex-col gap-4">
                          <p className="text-body">
                            Errors occurred while processing your request. Contact your Kafka administrator.
                          </p>
                          <List>
                            {errors.map((e) => (
                              <ListItem key={e}>{e}</ListItem>
                            ))}
                          </List>
                        </div>
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-6">
                      <Stepper.Navigation>
                        <Stepper.Step of="partitions">
                          <Stepper.Title>Select partitions</Stepper.Title>
                        </Stepper.Step>
                        <Stepper.Step of="offset">
                          <Stepper.Title>Choose offset</Stepper.Title>
                        </Stepper.Step>
                      </Stepper.Navigation>
                      {isOffsetStep ? null : (
                        <SelectPartitionStep
                          onPartitionOptionSelected={wizardSetters.setPartitionOption}
                          onPartitionSpecified={wizardSetters.setSpecifiedPartition}
                          partitions={range(0, topic.partitionCount)}
                          selectedPartitionOption={partitionOption}
                          specificPartition={specifiedPartition}
                        />
                      )}
                      {isOffsetStep && partitionOption !== null ? (
                        <SelectOffsetStep
                          offsetOption={offsetOption}
                          onOffsetOptionSelected={wizardSetters.setOffsetOption}
                          onOffsetSpecified={wizardSetters.setSpecifiedOffset}
                          onTimestampChanged={wizardSetters.setTimestamp}
                          partitionInfo={getPartitionInfo(wizardState)}
                          timestamp={timestamp}
                          topicName={topic.topicName}
                        />
                      ) : null}
                    </div>
                  )}
                </DialogBody>
                <DialogFooter>
                  {hasErrors || methods.isFirst ? null : (
                    <Button disabled={okButtonLoading} onClick={() => methods.prev()} variant="primary">
                      Back
                    </Button>
                  )}
                  <Button
                    disabled={isPrimaryDisabled(wizardState, hasErrors, isOffsetStep)}
                    isLoading={okButtonLoading}
                    onClick={() => {
                      if (hasErrors) {
                        onFinish();
                        return;
                      }
                      if (methods.isLast) {
                        submitDelete(topic.topicName);
                        return;
                      }
                      methods.next();
                    }}
                    variant={hasErrors ? 'primary' : 'destructive'}
                  >
                    {getPrimaryLabel(hasErrors, methods.isLast)}
                  </Button>
                </DialogFooter>
              </>
            );
          }}
        </Stepper.Provider>
      </DialogContent>
    </Dialog>
  );
}
