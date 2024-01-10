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

import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react';
import { api } from '../../../../state/backendApi';
import { DeleteRecordsResponseData, Partition, Topic } from '../../../../state/restInterfaces';
import { RadioOptionGroup } from '../../../../utils/tsxUtils';
import { prettyNumber } from '../../../../utils/utils';
import { range } from '../../../misc/common';

import styles from './DeleteRecordsModal.module.scss';
import { KowlTimePicker } from '../../../misc/KowlTimePicker';
import { Alert, AlertIcon, Button, Flex, Input, List, ListItem, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalOverlay, Slider, SliderFilledTrack, SliderMark, SliderThumb, SliderTrack, Spinner, Text, useToast } from '@redpanda-data/ui';
import { SingleSelect } from '../../../misc/Select';

type AllPartitions = 'allPartitions';
type SpecificPartition = 'specificPartition';
type PartitionOption = null | AllPartitions | SpecificPartition;

const DIGITS_ONLY_REGEX = /^\d*$/;

function TrashIcon() {
    return (
        <svg width="66" height="67" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="33" cy="33.6" r="33" fill="#F53649" />
            <path
                d="M18.806 24.729h28.388M29.452 31.826V42.47M36.548 31.826V42.47M20.58 24.729l1.775 21.29a3.548 3.548 0 003.548 3.549h14.194a3.548 3.548 0 003.548-3.549l1.774-21.29"
                stroke="#fff"
                strokeWidth="3.333"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M27.677 24.729v-5.322a1.774 1.774 0 011.775-1.775h7.096a1.774 1.774 0 011.774 1.774v5.323"
                stroke="#fff"
                strokeWidth="3.333"
                strokeLinecap="round"
                strokeLinejoin="round"
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
    partitions: Array<number>;
}): JSX.Element {
    return (
        <>
            <div className={styles.twoCol}>
                <TrashIcon />
                <p>
                    You are about to delete records in your topic. Choose on what partitions you want to delete records.
                    In the next step you can choose the new low water mark for your selected partitions.
                </p>
            </div>
            <RadioOptionGroup<PartitionOption>
                value={selectedPartitionOption}
                onChange={(v) => {
                    if (v === 'allPartitions') {
                        onSpecificPartitionSelected(null);
                    }
                    onPartitionOptionSelected(v);
                }}
                showContent="onlyWhenSelected"
                options={[
                    {
                        value: 'allPartitions',
                        title: 'All Partitions',
                        subTitle:
                            'Delete records until specified offset across all available partitions in this topic.',
                    },
                    {
                        value: 'specificPartition',
                        title: 'Specific Partition',
                        subTitle: 'Delete records within a specific partition in this topic only.',
                        content: (
                            // Workaround for Ant Design Issue: https://github.com/ant-design/ant-design/issues/25959
                            // fixes immediately self closing Select drop down after an option has already been selected
                            <span
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                            >
                                <SingleSelect<number | undefined>
                                    options={partitions.map(i => ({
                                        label: `Partition ${i}`,
                                        value: i
                                    }))}
                                    value={specificPartition ?? undefined}
                                    onChange={onSpecificPartitionSelected as (v: number | undefined) => void}
                                    placeholder="Choose Partition…"
                                />
                            </span>
                        ),
                    },
                ]}
            ></RadioOptionGroup>
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
                        topicName={topicName}
                        partitionInfo={partitionInfo}
                        onOffsetSpecified={onOffsetSpecified}
                    />
                ),
            };

    return (
        <>
            <div className={styles.twoCol}>
                <TrashIcon />
                <p>
                    Choose the new low offset for your selected partitions. Take note that this is a soft delete and
                    that the actual data may still be on the hard drive but not visible for any clients, even if they
                    request the data.
                </p>
            </div>
            <RadioOptionGroup<OffsetOption>
                value={selectedValue}
                onChange={selectValue}
                showContent="onlyWhenSelected"
                options={[
                    upperOption,
                    {
                        value: 'timestamp',
                        title: 'Timestamp',
                        subTitle: 'Delete all records prior to the selected timestamp.',
                        content: (
                            // Workaround for Ant Design Issue: https://github.com/ant-design/ant-design/issues/25959
                            // fixes immediately self closing Select drop down after an option has already been selected
                            <span
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}
                            >
                                <KowlTimePicker
                                    valueUtcMs={timestamp || Date.now().valueOf()}
                                    onChange={onTimestampChanged}
                                />
                            </span>
                        ),
                    },
                ]}
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
                ?.map(({ partitionError }, idx) => <li key={`${topicName}-partitionErrors-${idx}`} >{partitionError}</li>);
            const waterMarksErrors = api.topicWatermarksErrors
                .get(topicName)
                ?.map(({ waterMarksError }, idx) => <li key={`${topicName}-watermarkErrors-${idx}`} >{waterMarksError}</li>);
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
            return <Alert status="error">
                <AlertIcon />
                {message}
            </Alert>;
        }

        const partitions = api.topicPartitions?.get(topicName);

        if (!partitions) {
            return <Spinner size="lg" />;
        }

        const [, partitionId] = partitionInfo;
        const partition = partitions.find((p) => p.id === partitionId);

        if (!partition) {
            return <Alert status="error">
                <AlertIcon />
                {`Partition of topic ${topicName} with ID ${partitionId} not found!`}
            </Alert>;
        }

        const { marks, min, max } = getMarks(partition);
        return (
            <Flex alignItems="center" gap={2}>
                <Slider min={min} max={max} onChange={updateOffsetFromSlider} value={sliderValue}>
                    {marks && Object.entries(marks).map(([value, label]) =>
                        <SliderMark value={Number(value)} key={value}>
                            {label}
                        </SliderMark>
                    )}
                    <SliderTrack>
                        <SliderFilledTrack />
                    </SliderTrack>
                    <SliderThumb />
                </Slider>
                <Input
                    maxWidth={124}
                    value={sliderValue}
                    onChange={(e) => {
                        const { value } = e.target;
                        if (!DIGITS_ONLY_REGEX.test(value)) return;
                        updateOffsetFromSlider(Number(value))
                    }}
                    onBlur={() => {
                        if (sliderValue < min) {
                            updateOffsetFromSlider(min)
                        } else if (sliderValue > max) {
                            updateOffsetFromSlider(max)
                        } else {
                            updateOffsetFromSlider(sliderValue)
                        }
                    }}
                />
            </Flex>
        );
    }
);

function getMarks(partition: Partition) {
    if (!partition) return {
        min: 0,
        max: Infinity,
    };

    const diff = partition.waterMarkHigh - partition.waterMarkLow;

    let marks: Array<number> = [];

    if (diff > 0) {
        marks = [partition.waterMarkLow, partition.waterMarkLow];
    }

    if (diff > 100) {
        marks = [partition.waterMarkLow, partition.waterMarkLow + diff * 0.33, partition.waterMarkLow + diff * 0.67, partition.waterMarkHigh];
    }

    return {
        min: partition.waterMarkLow,
        max: partition.waterMarkHigh,
        marks: formatMarks(marks),
    };
}

function formatMarks(marks: number[]) {
    return marks.reduce((acc, it) => {
        const key = it.toFixed(0);
        const value = prettyNumber(it);
        acc[key] = value;
        return acc;
    }, {} as { [index: string]: string });
}

interface DeleteRecordsModalProps {
    topic: Topic | undefined | null;
    visible: boolean;
    onCancel: () => void;
    onFinish: () => void;
    afterClose: () => void;
}

export default function DeleteRecordsModal(props: DeleteRecordsModalProps): JSX.Element {
    const { visible, topic, onCancel, onFinish, afterClose } = props;
    const toast = useToast()

    useEffect(() => {
        topic?.topicName && api.refreshPartitionsForTopic(topic.topicName, true);
    }, [topic?.topicName]);

    const [partitionOption, setPartitionOption] = useState<PartitionOption>(null);
    const [specifiedPartition, setSpecifiedPartition] = useState<null | number>(null);
    const [offsetOption, setOffsetOption] = useState<OffsetOption>(null);
    const [step, setStep] = useState<1 | 2>(1);
    const [specifiedOffset, setSpecifiedOffset] = useState<number>(0);
    const [okButtonLoading, setOkButtonLoading] = useState<boolean>(false);
    const [timestamp, setTimestamp] = useState<number>(Date.now());
    const [errors, setErrors] = useState<Array<string>>([]);

    const hasErrors = errors.length > 0;
    const isAllPartitions = partitionOption === 'allPartitions';
    const isSpecficPartition = partitionOption === 'specificPartition';
    const isManualOffset = offsetOption === 'manualOffset';
    const isHighWatermark = offsetOption === 'highWatermark';
    const isTimestamp = offsetOption === 'timestamp';

    const handleFinish = async (responseData: DeleteRecordsResponseData | null | void) => {
        if (responseData == null) {
            setErrors([
                'You are not allowed to delete records on this topic. Please contact your Kafka administrator.',
            ]);
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
            })
        }
    };

    if (!topic) return <></>;

    const isOkButtonDisabled = () => {
        if (hasErrors) return false;

        if (step === 1) {
            return partitionOption === null || (isSpecficPartition && specifiedPartition === null);
        }

        if (step === 2) {
            return offsetOption === null || (isTimestamp && timestamp === null);
        }

        return offsetOption === null;
    };

    const onOk = () => {
        if (hasErrors) {
            onFinish();
        }

        if (step === 1) {
            setStep(2);
            return;
        }

        setOkButtonLoading(true);

        if (isAllPartitions && isHighWatermark) {
            api.deleteTopicRecordsFromAllPartitionsHighWatermark(topic.topicName).then(handleFinish);
        } else if (isSpecficPartition && isManualOffset) {
            api.deleteTopicRecords(topic.topicName, specifiedOffset, specifiedPartition!).then(handleFinish);
        } else if (isTimestamp && timestamp != null) {
            api.getTopicOffsetsByTimestamp([topic.topicName], timestamp).then((topicOffsets) => {
                if (isAllPartitions) {
                    const pairs = topicOffsets[0].partitions.map(({ partitionId, offset }) => ({
                        partitionId,
                        offset,
                    }));
                    api.deleteTopicRecordsFromMultiplePartitionOffsetPairs(topic.topicName, pairs).then(handleFinish);
                } else if (isSpecficPartition) {
                    const partitionOffset = topicOffsets[0].partitions.find(
                        (p) => specifiedPartition === p.partitionId
                    )?.offset;

                    if (partitionOffset != null) {
                        api.deleteTopicRecords(topic.topicName, partitionOffset, specifiedPartition!).then(
                            handleFinish
                        );
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
                        <Alert status="error" mb={2}>
                            <AlertIcon />
                            <Flex flexDirection="column" gap={4} p={2}>
                                <Text>
                                    Errors have occurred when processing your request. Please contact your Kafka
                                    Administrator.
                                </Text>
                                <List>{errors.map((e, i) => <ListItem key={String(i)}>{e}</ListItem>)}</List>
                            </Flex>
                        </Alert>
                    )}
                    {!hasErrors && step === 1 && (
                        <SelectPartitionStep
                            partitions={range(0, topic.partitionCount)}
                            onPartitionOptionSelected={setPartitionOption}
                            selectedPartitionOption={partitionOption}
                            specificPartition={specifiedPartition}
                            onPartitionSpecified={setSpecifiedPartition}
                        />
                    )}
                    {!hasErrors && step === 2 && partitionOption != null && (
                        <SelectOffsetStep
                            onOffsetOptionSelected={setOffsetOption}
                            offsetOption={offsetOption}
                            topicName={topic.topicName}
                            onOffsetSpecified={setSpecifiedOffset}
                            partitionInfo={getPartitionInfo()}
                            timestamp={timestamp}
                            onTimestampChanged={setTimestamp}
                        />
                    )}
                </ModalBody>
                <ModalFooter gap={2}>
                    <Button
                        variant="solid"
                        colorScheme={hasErrors ? 'gray' : 'red'}
                        onClick={onOk}
                        isLoading={okButtonLoading}
                        isDisabled={isOkButtonDisabled()}
                    >
                        {hasErrors ? 'Ok' : step === 1 ? 'Choose End Offset' : 'Delete Records'}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    )
}
