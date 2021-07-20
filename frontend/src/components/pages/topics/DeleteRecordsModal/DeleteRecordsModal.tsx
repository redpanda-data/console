import React, { useEffect, useState } from 'react';
import { Alert, Input, Modal, Select, Slider, Spin } from 'antd';
import { observer } from 'mobx-react';
import { api } from '../../../../state/backendApi';
import { Partition, Topic } from '../../../../state/restInterfaces';
import { RadioOptionGroup } from '../../../../utils/tsxUtils';
import { fromDecimalSeparated, keepInRange, prettyNumber, toDecimalSeparated } from '../../../../utils/utils';
import { range } from '../../../misc/common';

import styles from './DeleteRecordsModal.module.scss';

type PartitionOption = 'allPartitions' | 'specificPartition';

const SLIDER_INPUT_REGEX = /(^([1-9]\d*)|(\d{1,3}(,\d{3})*)$)|^$/;

function SelectPartitionStep({
    selectedPartitionOption,
    onPartitionOptionSelected,
    onSpecificPartitionSelected,
    partitions,
    selectedPartition,
}: {
    selectedPartitionOption: PartitionOption;
    onPartitionOptionSelected: (v: PartitionOption) => void;
    onSpecificPartitionSelected: (v: number) => void;
    partitions: Array<number>;
    selectedPartition: number;
}): JSX.Element {
    return (
        <>
            <p>
                You are about to delete records in your topic. Choose on what partitions you want to delete records. In
                the next step you can choose the new low water mark for your selected partitions.
            </p>
            <RadioOptionGroup<PartitionOption>
                value={selectedPartitionOption}
                onChange={onPartitionOptionSelected}
                showContent="always"
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
                            <>
                                <Select<number>
                                    value={selectedPartition}
                                    size="middle"
                                    className={styles.partitionSelect}
                                    onChange={onSpecificPartitionSelected}
                                >
                                    {partitions.map((i) => (
                                        <Select.Option key={i} value={i}>
                                            Partition {i.toString()}
                                        </Select.Option>
                                    ))}
                                </Select>
                            </>
                        ),
                    },
                ]}
            ></RadioOptionGroup>
        </>
    );
}

type OffsetOption = 'manualOffset' | 'timestamp';

const SelectOffsetStep = ({
    selectValue,
    selectedValue,
    topicName,
    partitionId,
    partitionOption,
}: {
    partitionId: number;
    topicName: string;
    selectedValue: OffsetOption;
    selectValue: (v: OffsetOption) => void;
    partitionOption: PartitionOption;
}) => {
    debugger;
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
                showContent="always"
                options={[
                    {
                        value: 'manualOffset',
                        title: 'Manual Offset',
                        subTitle:
                            partitionOption === 'allPartitions'
                                ? 'Delete records until high watermark across all partitions in this topic.'
                                : 'Delete records until specified offset across all selected partitions in this topic.',
                        content: (
                            <ManualOffsetContent
                                topicName={topicName}
                                partitionId={partitionId}
                                partitionOption={partitionOption}
                            />
                        ),
                    },
                    {
                        value: 'timestamp',
                        title: 'Timestamp',
                        subTitle: 'Delete all records prior to the selected timestamp.',
                    },
                ]}
            />
        </>
    );
};

const ManualOffsetContent = observer(
    ({
        topicName,
        partitionId,
        partitionOption,
    }: {
        topicName: string;
        partitionId: number;
        partitionOption: PartitionOption;
    }) => {
        const [sliderValue, setSliderValue] = useState(0);

        debugger;

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

        debugger;

        if (!partitions) {
            return <Spin />;
        }

        if (partitionOption === 'allPartitions') {
            const { low, high } = getMinMaxWatermarks(partitions);
            return (
                <div className={styles.sliderContainer}>
                    <Slider disabled min={low} max={high} value={high} className={styles.slider} />
                    <Input disabled className={styles.sliderValue} value={toDecimalSeparated(high)} />
                </div>
            );
        }

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
                    onChange={setSliderValue}
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
                        setSliderValue(rangedValue);
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
}

export default function DeleteRecordsModal(props: DeleteRecordsModalProps): JSX.Element {
    const { visible, topic, onCancel } = props;

    if (!topic) return <></>;

    useEffect(() => {
        api.refreshPartitionsForTopic(topic.topicName, true);
    }, [topic.topicName]);

    const [partitionOption, setPartitionOption] = useState<PartitionOption>('allPartitions');
    const [specificPartition, setSpecificPartition] = useState<number>(0);
    const [offsetOption, setOffsetOption] = useState<OffsetOption>('manualOffset');
    const [step, setStep] = useState<1 | 2>(1);

    return (
        <Modal
            title="Delete records in topic"
            visible={visible}
            okType="danger"
            okText={step === 1 ? 'Choose End Offset' : 'Delete Records'}
            onOk={() => step === 1 && setStep(2)}
            onCancel={onCancel}
            width="700px"
        >
            {step === 1 && (
                <SelectPartitionStep
                    partitions={range(0, topic.partitionCount)}
                    onPartitionOptionSelected={setPartitionOption}
                    selectedPartitionOption={partitionOption}
                    onSpecificPartitionSelected={setSpecificPartition}
                    selectedPartition={specificPartition}
                />
            )}
            {step === 2 && specificPartition != null && (
                <SelectOffsetStep
                    selectValue={setOffsetOption}
                    selectedValue={offsetOption}
                    topicName={topic.topicName}
                    partitionId={specificPartition}
                    partitionOption={partitionOption}
                />
            )}
        </Modal>
    );
}
