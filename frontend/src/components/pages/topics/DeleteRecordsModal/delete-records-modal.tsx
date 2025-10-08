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
  Alert,
  AlertIcon,
  Button,
  Flex,
  Input,
  List,
  ListItem,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Slider,
  SliderFilledTrack,
  SliderMark,
  SliderThumb,
  SliderTrack,
  Spinner,
  Text,
  useToast,
} from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { useEffect, useState } from 'react';

import styles from './DeleteRecordsModal.module.scss';
import { api } from '../../../../state/backend-api';
import type { DeleteRecordsResponseData, Partition, Topic } from '../../../../state/rest-interfaces';
import { RadioOptionGroup } from '../../../../utils/tsx-utils';
import { prettyNumber } from '../../../../utils/utils';
import { range } from '../../../misc/common';
import { KowlTimePicker } from '../../../misc/kowl-time-picker';
import { SingleSelect } from '../../../misc/select';

type AllPartitions = 'allPartitions';
type SpecificPartition = 'specificPartition';
type PartitionOption = null | AllPartitions | SpecificPartition;

const DIGITS_ONLY_REGEX = /^\d*$/;

function TrashIcon() {
  return (
    <svg fill="none" height="67" width="66" xmlns="http://www.w3.org/2000/svg">
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
    <>
      <div className={styles.twoCol}>
        <TrashIcon />
        <p>
          You are about to delete records in your topic. Choose on what partitions you want to delete records. In the
          next step you can choose the new low water mark for your selected partitions.
        </p>
      </div>
      <RadioOptionGroup<PartitionOption>
        onChange={(v) => {
          if (v === 'allPartitions') {
            onSpecificPartitionSelected(null);
          }
          onPartitionOptionSelected(v);
        }}
        options={[
          {
            value: 'allPartitions',
            title: 'All Partitions',
            subTitle: 'Delete records until specified offset across all available partitions in this topic.',
          },
          {
            value: 'specificPartition',
            title: 'Specific Partition',
            subTitle: 'Delete records within a specific partition in this topic only.',
            content: (
              // Workaround for Ant Design Issue: https://github.com/ant-design/ant-design/issues/25959
              // fixes immediately self closing Select drop down after an option has already been selected
              // biome-ignore lint/a11y/noStaticElementInteractions: event handlers needed for dropdown workaround
              <div
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
                role="presentation"
              >
                <SingleSelect<number | undefined>
                  onChange={onSpecificPartitionSelected as (v: number | undefined) => void}
                  options={partitions.map((i) => ({
                    label: `Partition ${i}`,
                    value: i,
                  }))}
                  placeholder="Choose Partition…"
                  value={specificPartition ?? undefined}
                />
              </div>
            ),
          },
        ]}
        showContent="onlyWhenSelected"
        value={selectedPartitionOption}
      />
    </>
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
  const upperOption =
    partitionInfo === 'allPartitions'
      ? {
          value: 'highWatermark' as OffsetOption,
          title: 'High Watermark',
          subTitle: 'Delete records until high watermark across all partitions in this topic.',
        }
      : {
          value: 'manualOffset' as OffsetOption,
          title: 'Manual Offset',
          subTitle: `Delete records until specified offset across all selected partitions (ID: ${partitionInfo[1]}) in this topic.`,
          content: (
            <ManualOffsetContent
              onOffsetSpecified={onOffsetSpecified}
              partitionInfo={partitionInfo}
              topicName={topicName}
            />
          ),
        };

  return (
    <>
      <div className={styles.twoCol}>
        <TrashIcon />
        <p>
          Choose the new low offset for your selected partitions. Take note that this is a soft delete and that the
          actual data may still be on the hard drive but not visible for any clients, even if they request the data.
        </p>
      </div>
      <RadioOptionGroup<OffsetOption>
        onChange={selectValue}
        options={[
          upperOption,
          {
            value: 'timestamp',
            title: 'Timestamp',
            subTitle: 'Delete all records prior to the selected timestamp.',
            content: (
              // Workaround for Ant Design Issue: https://github.com/ant-design/ant-design/issues/25959
              // fixes immediately self closing Select drop down after an option has already been selected
              // biome-ignore lint/a11y/noStaticElementInteractions: event handlers needed for dropdown workaround
              <div
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
                role="presentation"
              >
                <KowlTimePicker onChange={onTimestampChanged} valueUtcMs={timestamp || Date.now().valueOf()} />
              </div>
            ),
          },
        ]}
        showContent="onlyWhenSelected"
        value={selectedValue}
      />
    </>
  );
};

const ManualOffsetContent = observer(
  ({
    topicName,
    onOffsetSpecified,
    partitionInfo,
  }: {
    topicName: string;
    partitionInfo: PartitionInfo;
    onOffsetSpecified: (v: number) => void;
  }) => {
    const [sliderValue, setSliderValue] = useState(0);

    const updateOffsetFromSlider = (v: number) => {
      setSliderValue(v);
      onOffsetSpecified(v);
    };

    if (api.topicPartitionErrors?.get(topicName) || api.topicWatermarksErrors?.get(topicName)) {
      const partitionErrors = api.topicPartitionErrors
        .get(topicName)
        ?.map(({ partitionError }, idx) => <li key={`${topicName}-partitionErrors-${idx}`}>{partitionError}</li>);
      const waterMarksErrors = api.topicWatermarksErrors
        .get(topicName)
        ?.map(({ waterMarksError }, idx) => <li key={`${topicName}-watermarkErrors-${idx}`}>{waterMarksError}</li>);
      const message = (
        <>
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
        </>
      );
      return (
        <Alert status="error">
          <AlertIcon />
          {message}
        </Alert>
      );
    }

    const partitions = api.topicPartitions?.get(topicName);

    if (!partitions) {
      return <Spinner size="lg" />;
    }

    const [, partitionId] = partitionInfo;
    const partition = partitions.find((p) => p.id === partitionId);

    if (!partition) {
      return (
        <Alert status="error">
          <AlertIcon />
          {`Partition of topic ${topicName} with ID ${partitionId} not found!`}
        </Alert>
      );
    }

    const { marks, min, max } = getMarks(partition);
    return (
      <Flex alignItems="center" gap={2}>
        <Slider max={max} min={min} onChange={updateOffsetFromSlider} value={sliderValue}>
          {marks &&
            Object.entries(marks).map(([value, label]) => (
              <SliderMark key={value} value={Number(value)}>
                {label}
              </SliderMark>
            ))}
          <SliderTrack>
            <SliderFilledTrack />
          </SliderTrack>
          <SliderThumb />
        </Slider>
        <Input
          maxWidth={124}
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
      </Flex>
    );
  }
);

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
  const { visible, topic, onCancel, onFinish, afterClose } = props;
  const toast = useToast();

  useEffect(() => {
    if (topic?.topicName) {
      api.refreshPartitionsForTopic(topic.topicName, true);
    }
  }, [topic?.topicName]);

  const [partitionOption, setPartitionOption] = useState<PartitionOption>(null);
  const [specifiedPartition, setSpecifiedPartition] = useState<null | number>(null);
  const [offsetOption, setOffsetOption] = useState<OffsetOption>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [specifiedOffset, setSpecifiedOffset] = useState<number>(0);
  const [okButtonLoading, setOkButtonLoading] = useState<boolean>(false);
  const [timestamp, setTimestamp] = useState<number>(Date.now());
  const [errors, setErrors] = useState<string[]>([]);

  const hasErrors = errors.length > 0;
  const isAllPartitions = partitionOption === 'allPartitions';
  const isSpecficPartition = partitionOption === 'specificPartition';
  const isManualOffset = offsetOption === 'manualOffset';
  const isHighWatermark = offsetOption === 'highWatermark';
  const isTimestamp = offsetOption === 'timestamp';

  // biome-ignore lint/suspicious/noConfusingVoidType: needed to fix error TS2345
  const handleFinish = (responseData: void | DeleteRecordsResponseData | null | undefined) => {
    if (responseData == null) {
      setErrors(['You are not allowed to delete records on this topic. Please contact your Kafka administrator.']);
      return;
    }

    const errorPartitions = responseData.partitions.filter((partition) => !!partition.error);

    if (errorPartitions.length > 0) {
      setErrors(errorPartitions.map(({ partitionId, error }) => `Partition ${partitionId}: ${error}`));
      setOkButtonLoading(false);
    } else {
      onFinish();
      toast({
        description: 'Records deleted successfully',
        status: 'success',
      });
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
    } else if (isTimestamp && timestamp != null) {
      api.getTopicOffsetsByTimestamp([topicName], timestamp).then((topicOffsets) => {
        if (isAllPartitions) {
          const pairs = topicOffsets[0].partitions.map(({ partitionId, offset }) => ({
            partitionId,
            offset,
          }));
          api.deleteTopicRecordsFromMultiplePartitionOffsetPairs(topicName, pairs)?.then(handleFinish);
        } else if (isSpecficPartition) {
          const partitionOffset = topicOffsets[0].partitions.find((p) => specifiedPartition === p.partitionId)?.offset;

          if (partitionOffset != null) {
            // biome-ignore lint/style/noNonNullAssertion: not touching MobX observables
            api.deleteTopicRecords(topicName, partitionOffset, specifiedPartition!)?.then(handleFinish);
          } else {
            setErrors([
              'No partition offset was specified, this should not happen. Please contact your administrator.',
            ]);
          }
        }
      });
    } else {
      setErrors(['Something went wrong, please contact your administrator.']);
    }
  };

  const getPartitionInfo = (): PartitionInfo => {
    if (specifiedPartition != null && partitionOption === 'specificPartition') {
      return ['specificPartition', specifiedPartition];
    }
    return 'allPartitions';
  };

  return (
    <Modal isOpen={visible} onClose={onCancel} onCloseComplete={afterClose}>
      <ModalOverlay />
      <ModalContent minW="2xl">
        <ModalHeader>Delete records in topic</ModalHeader>
        <ModalBody>
          {hasErrors && (
            <Alert mb={2} status="error">
              <AlertIcon />
              <Flex flexDirection="column" gap={4} p={2}>
                <Text>Errors have occurred when processing your request. Please contact your Kafka Administrator.</Text>
                <List>
                  {errors.map((e, i) => (
                    <ListItem key={String(i)}>{e}</ListItem>
                  ))}
                </List>
              </Flex>
            </Alert>
          )}
          {!hasErrors && step === 1 && (
            <SelectPartitionStep
              onPartitionOptionSelected={setPartitionOption}
              onPartitionSpecified={setSpecifiedPartition}
              partitions={range(0, topic.partitionCount)}
              selectedPartitionOption={partitionOption}
              specificPartition={specifiedPartition}
            />
          )}
          {!hasErrors && step === 2 && partitionOption != null && (
            <SelectOffsetStep
              offsetOption={offsetOption}
              onOffsetOptionSelected={setOffsetOption}
              onOffsetSpecified={setSpecifiedOffset}
              onTimestampChanged={setTimestamp}
              partitionInfo={getPartitionInfo()}
              timestamp={timestamp}
              topicName={topic.topicName}
            />
          )}
        </ModalBody>
        <ModalFooter gap={2}>
          <Button
            colorScheme={hasErrors ? 'gray' : 'red'}
            isDisabled={isOkButtonDisabled()}
            isLoading={okButtonLoading}
            onClick={onOk}
            variant="solid"
          >
            {(() => {
              if (hasErrors) {
                return 'Ok';
              }
              if (step === 1) {
                return 'Choose End Offset';
              }
              return 'Delete Records';
            })()}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
