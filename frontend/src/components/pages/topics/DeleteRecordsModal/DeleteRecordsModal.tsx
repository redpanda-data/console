import React, { useEffect, useState } from 'react';
import { Alert, Input, Modal, Select, Slider, Spin } from 'antd';
import { observer } from 'mobx-react';
import { api } from '../../../../state/backendApi';
import { DeleteRecordsResponseData, Partition, Topic } from '../../../../state/restInterfaces';
import { RadioOptionGroup } from '../../../../utils/tsxUtils';
import { fromDecimalSeparated, keepInRange, prettyNumber, toDecimalSeparated } from '../../../../utils/utils';
import { range } from '../../../misc/common';

import styles from './DeleteRecordsModal.module.scss';
import { KowlTimePicker } from '../../../misc/KowlTimePicker';

type AllPartitions = 'allPartitions';
type SpecificPartition = 'specificPartition';
type PartitionOption = null | AllPartitions | SpecificPartition;

const SLIDER_INPUT_REGEX = /(^([1-9]\d*)|(\d{1,3}(,\d{3})*)$)|^$/;

function SelectPartitionStep({
    selectedPartitionOption,
    onPartitionOptionSelected,
    onPartitionSpecified: onSpecificPartitionSelected,
    partitions,
}: {
    selectedPartitionOption: PartitionOption;
    onPartitionOptionSelected: (v: PartitionOption) => void;
    onPartitionSpecified: (v: null | number) => void;
    partitions: Array<number>;
}): JSX.Element {
    return (
        <>
            <p>
                You are about to delete records in your topic. Choose on what partitions you want to delete records. In
                the next step you can choose the new low water mark for your selected partitions.
            </p>
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
                                <Select<number>
                                    size="middle"
                                    className={styles.partitionSelect}
                                    onChange={onSpecificPartitionSelected}
                                    defaultActiveFirstOption={false}
                                    placeholder="Choose Partition…"
                                >
                                    {partitions.map((i) => (
                                        <Select.Option key={i} value={i}>
                                            Partition {i.toString()}
                                        </Select.Option>
                                    ))}
                                </Select>
                            </span>
                        ),
                    },
                ]}
            ></RadioOptionGroup>
        </>
    );
}

type OffsetOption = null | 'manualOffset' | 'timestamp';
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
    return (
        <>
            <p>
                Choose the new low offset for your selected partitions. Take note that this is a soft delete and that
                the actual data may still be on the hard drive but not visible for any clients, even if they request the
                data.
            </p>
            <RadioOptionGroup<OffsetOption>
                value={selectedValue}
                onChange={selectValue}
                showContent="onlyWhenSelected"
                options={[
                    {
                        value: 'manualOffset',
                        title: 'Manual Offset',
                        subTitle:
                            partitionInfo === 'allPartitions'
                                ? 'Delete records until high watermark across all partitions in this topic.'
                                : `Delete records until specified offset across all selected partitions (ID: ${partitionInfo[1]}) in this topic.`,
                        content: (
                            <ManualOffsetContent
                                topicName={topicName}
                                partitionInfo={partitionInfo}
                                onOffsetSpecified={onOffsetSpecified}
                            />
                        ),
                    },
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
                ?.map(({ partitionError }) => <li>{partitionError}</li>);
            const waterMarksErrors = api.topicWatermarksErrors
                .get(topicName)
                ?.map(({ waterMarksError }) => <li>{waterMarksError}</li>);
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
            return <Alert type="error" message={message} />;
        }

        const partitions = api.topicPartitions?.get(topicName);

        if (!partitions) {
            return <Spin />;
        }

        if (partitionInfo === 'allPartitions') {
            const { low, high } = getMinMaxWatermarks(partitions);
            return (
                <div className={styles.sliderContainer}>
                    <Slider disabled min={low} max={high} value={high} className={styles.slider} />
                    <Input disabled className={styles.sliderValue} value={toDecimalSeparated(high)} />
                </div>
            );
        }

        const [_, partitionId] = partitionInfo;
        const partition = partitions.find((p) => p.id === partitionId);

        if (!partition) {
            return <Alert type="error" message={`Partition of topic ${topicName} with ID ${partitionId} not found!`} />;
        }

        const { marks, min, max } = getMarks(partition);
        return (
            <div className={styles.sliderContainer}>
                <Slider
                    marks={marks}
                    min={min}
                    max={max}
                    onChange={updateOffsetFromSlider}
                    value={sliderValue}
                    className={styles.slider}
                />
                <Input
                    className={styles.sliderValue}
                    value={toDecimalSeparated(sliderValue)}
                    onChange={(e) => {
                        const { value } = e.target;
                        if (!SLIDER_INPUT_REGEX.test(value)) return;
                        const rangedValue = keepInRange(
                            fromDecimalSeparated(value),
                            min || 0,
                            max || Number.MAX_SAFE_INTEGER
                        );
                        updateOffsetFromSlider(rangedValue);
                    }}
                />
            </div>
        );
    }
);

function getMinMaxWatermarks(partitions: Array<Partition>) {
    return partitions.reduce(
        (acc, it) => {
            return {
                low: Math.min(acc.low, it.waterMarkLow),
                high: Math.max(acc.high, it.waterMarkHigh),
            };
        },
        { low: Infinity, high: 0 }
    );
}

function getMarks(partition: Partition) {
    if (!partition) return {};

    const diff = partition.waterMarkHigh - partition.waterMarkLow;
    const marks = [partition.waterMarkLow, diff * 0.33, diff * 0.67, partition.waterMarkHigh];

    const formattedMarks = marks.reduce((acc, it) => {
        const key = it.toFixed(0);
        const value = prettyNumber(it);
        acc[key] = value;
        return acc;
    }, {} as { [index: string]: string });

    return {
        min: partition.waterMarkLow,
        max: partition.waterMarkHigh,
        marks: formattedMarks,
    };
}

interface DeleteRecordsModalProps {
    topic: Topic | undefined | null;
    visible: boolean;
    onCancel: () => void;
    onFinish: () => void;
    afterClose: () => void
}

export default function DeleteRecordsModal(props: DeleteRecordsModalProps): JSX.Element {
    const { visible, topic, onCancel, onFinish, afterClose } = props;

    useEffect(() => {
        topic?.topicName && api.refreshPartitionsForTopic(topic.topicName, true);
    }, [topic?.topicName]);

    const [partitionOption, setPartitionOption] = useState<PartitionOption>(null);
    const [specifiedPartition, setSpecifiedPartition] = useState<null | number>(null);
    const [offsetOption, setOffsetOption] = useState<OffsetOption>(null);
    const [step, setStep] = useState<1 | 2>(1);
    const [specifiedOffset, setSpecifiedOffset] = useState<number>(0);
    const [okButtonLoading, setOkButtonLoading] = useState<boolean>(false);
    const [timestamp, setTimestamp] = useState<null | number>(null);
    const [errors, setErrors] = useState<Array<string>>([]);

    const hasErrors = errors.length > 0;
    const isAllPartitions = partitionOption === 'allPartitions';
    const isSpecficPartition = partitionOption === 'specificPartition';
    const isManualOffset = offsetOption === 'manualOffset';
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
            setOkButtonLoading(false)
        } else {
            onFinish();
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

        if (isAllPartitions && isManualOffset) {
            api.deleteTopicRecordsFromAllPartitionsHighWatermark(topic.topicName).then(handleFinish);
        } else if (isSpecficPartition && isManualOffset) {
            api.deleteTopicRecords(topic.topicName, specifiedOffset, specifiedPartition!).then(handleFinish);
        } else if (isTimestamp && timestamp != null) {
            api.getTopicOffsetsByTimestamp([topic.topicName], timestamp).then((topicOffsets) => {
                if (isAllPartitions) {
                    // TODO: solve multiple offsets
                } else if (isSpecficPartition) {
                    const partitionOffset = topicOffsets[0].partitions.find(
                        (p) => specifiedPartition === p.partitionId
                    )?.offset;

                    if (partitionOffset && partitionOffset >= 0) {
                        api.deleteTopicRecords(topic.topicName, partitionOffset, specifiedPartition!).then(onFinish);
                    } else {
                        onFinish();
                    }
                }
            });
        }
    };

    const getPartitionInfo = (): PartitionInfo => {
        if (specifiedPartition != null && partitionOption === 'specificPartition') {
            return ['specificPartition', specifiedPartition];
        }
        return 'allPartitions';
    };

    return (
        <Modal
            title="Delete records in topic"
            visible={visible}
            okType={hasErrors ? "default" : "danger"}
            okText={hasErrors ? 'Ok' : step === 1 ? 'Choose End Offset' : 'Delete Records'}
            onOk={onOk}
            okButtonProps={{
                disabled: isOkButtonDisabled(),
                loading: okButtonLoading,
            }}
            onCancel={onCancel}
            width="700px"
            afterClose={afterClose}
        >
            {hasErrors && <Alert type="error" message={<>
                <p>Errors have occurred when processing your request. Please contact your Kafka Administrator.</p>
                <ul>
                    {errors.map((error) => <li>{error}</li>)}
                </ul>
            </>} />}
            {!hasErrors && step === 1 && (
                <SelectPartitionStep
                    partitions={range(0, topic.partitionCount)}
                    onPartitionOptionSelected={setPartitionOption}
                    selectedPartitionOption={partitionOption}
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
        </Modal>
    );
}
