import { PlusIcon, XIcon } from '@primer/octicons-react';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { Component, useEffect, useState } from 'react';
import type { TopicConfigEntry } from '../../../../state/restInterfaces';
import { Label } from '../../../../utils/tsxUtils';
import { prettyBytes, prettyMilliseconds, titleCase } from '../../../../utils/utils';
import './CreateTopicModal.scss';
import {
  Box,
  Button,
  Flex,
  Input,
  InputGroup,
  InputLeftAddon,
  InputRightAddon,
  NumberInput,
  Select,
  Slider,
  SliderFilledTrack,
  SliderThumb,
  SliderTrack,
  isSingleValue,
} from '@redpanda-data/ui';
import { isServerless } from '../../../../config';
import { api } from '../../../../state/backendApi';
import { SingleSelect } from '../../../misc/Select';
import type { CleanupPolicyType } from '../types';

type CreateTopicModalState = {
  topicName: string; // required

  partitions?: number;
  replicationFactor?: number;
  minInSyncReplicas?: number;

  cleanupPolicy: CleanupPolicyType; // required

  retentionTimeMs: number;
  retentionTimeUnit: RetentionTimeUnit;

  retentionSize: number;
  retentionSizeUnit: RetentionSizeUnit;

  additionalConfig: TopicConfigEntry[];

  defaults: {
    readonly retentionTime: string | undefined;
    readonly retentionBytes: string | undefined;
    readonly replicationFactor: string | undefined;
    readonly partitions: string | undefined;
    readonly cleanupPolicy: string | undefined;
    readonly minInSyncReplicas: string | undefined;
  };

  hasErrors: boolean;
};

type Props = {
  state: CreateTopicModalState;
};

@observer
export class CreateTopicModalContent extends Component<Props> {
  render() {
    const state = this.props.state;

    let replicationFactorError = '';
    if (api.clusterOverview)
      if (state.replicationFactor != null)
        if (api.isRedpanda) {
          // enforce odd numbers
          const isOdd = state.replicationFactor % 2 === 1;
          if (!isOdd) {
            replicationFactorError = 'Replication factor must be an odd number';
          }
        }

    return (
      <div className="createTopicModal">
        <div style={{ display: 'flex', gap: '2em', flexDirection: 'column' }}>
          <Label text="Topic Name">
            <Input
              data-testid="topic-name"
              value={state.topicName}
              onChange={(e) => (state.topicName = e.target.value)}
              width="100%"
              autoFocus
            />
          </Label>

          <div style={{ display: 'flex', gap: '2em' }}>
            <Label text="Partitions" style={{ flexBasis: '160px' }}>
              <NumInput
                value={state.partitions}
                onChange={(e) => (state.partitions = e)}
                placeholder={state.defaults.partitions}
                min={1}
              />
            </Label>
            <Label text="Replication Factor" style={{ flexBasis: '160px' }}>
              <Box>
                <NumInput
                  value={state.replicationFactor}
                  onChange={(e) => (state.replicationFactor = e)}
                  min={1}
                  placeholder={state.defaults.replicationFactor}
                  disabled={isServerless()}
                />
                <Box
                  color="red.500"
                  fontWeight={500}
                  fontSize="12px"
                  visibility={replicationFactorError ? undefined : 'hidden'}
                >
                  {replicationFactorError}
                </Box>
              </Box>
            </Label>

            {!api.isRedpanda && (
              <Label text="Min In-Sync Replicas" style={{ flexBasis: '160px' }}>
                <NumInput
                  value={state.minInSyncReplicas}
                  onChange={(e) => (state.minInSyncReplicas = e)}
                  min={1}
                  placeholder={state.defaults.minInSyncReplicas}
                />
              </Label>
            )}
          </div>

          <div style={{ display: 'flex', gap: '2em', zIndex: 5 }}>
            {!isServerless() && (
              <Label text="Cleanup Policy" style={{ flexBasis: '160px' }}>
                <SingleSelect<CleanupPolicyType>
                  options={[
                    { value: 'delete', label: 'delete' },
                    { value: 'compact', label: 'compact' },
                    { value: 'compact,delete', label: 'compact,delete' },
                  ]}
                  isReadOnly={isServerless()}
                  value={state.cleanupPolicy}
                  onChange={(e) => (state.cleanupPolicy = e)}
                />
              </Label>
            )}
            <Label text="Retention Time" style={{ flexBasis: '220px', flexGrow: 1 }}>
              <RetentionTimeSelect
                value={state.retentionTimeMs}
                onChangeValue={(x) => (state.retentionTimeMs = x)}
                unit={state.retentionTimeUnit}
                onChangeUnit={(x) => (state.retentionTimeUnit = x)}
                defaultConfigValue={state.defaults.retentionTime}
              />
            </Label>
            <Label text="Retention Size" style={{ flexBasis: '220px', flexGrow: 1 }}>
              <RetentionSizeSelect
                value={state.retentionSize}
                onChangeValue={(x) => (state.retentionSize = x)}
                unit={state.retentionSizeUnit}
                onChangeUnit={(x) => (state.retentionSizeUnit = x)}
                defaultConfigValue={state.defaults.retentionBytes}
              />
            </Label>
          </div>

          {!isServerless() && (
            <div>
              <h4 style={{ fontSize: '13px' }}>Additional Configuration</h4>
              <KeyValuePairEditor entries={state.additionalConfig} />
            </div>
          )}
        </div>
      </div>
    );
  }
}

export function NumInput(p: {
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  addonBefore?: React.ReactNode;
  addonAfter?: React.ReactNode;
  className?: string;
}) {
  // We need to keep track of intermediate values.
  // Otherwise, typing '2e' for example, would be rejected.
  // But the user might still add '5', and '2e5' is a valid number.
  const [editValue, setEditValue] = useState(p.value == null ? undefined : String(p.value));
  useEffect(() => setEditValue(p.value == null ? undefined : String(p.value)), [p.value]);

  const commit = (x: number | undefined) => {
    if (p.disabled) return;
    if (x != null && p.min != null && x < p.min) x = p.min;
    if (x != null && p.max != null && x > p.max) x = p.max;
    setEditValue(x === undefined ? x : String(x));
    p.onChange?.(x);
  };

  const changeBy = (dx: number) => {
    let newValue = (p.value ?? 0) + dx;
    newValue = Math.round(newValue);
    commit(newValue);
  };

  // InputLeftElement -> prefix
  // InputLeftAddon   -> addonBefore

  return (
    <InputGroup>
      {p.addonBefore && <InputLeftAddon>{p.addonBefore}</InputLeftAddon>}

      <Input
        className={`numericInput ${p.className ?? ''}`}
        style={{ minWidth: '120px', width: '100%' }}
        spellCheck={false}
        placeholder={p.placeholder}
        disabled={p.disabled}
        value={p.disabled && p.placeholder && p.value == null ? undefined : editValue}
        onChange={(e) => {
          setEditValue(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== '' && !Number.isNaN(n)) p.onChange?.(n);
          else p.onChange?.(undefined);
        }}
        onWheel={(e) => changeBy(-Math.sign(e.deltaY))}
        onBlur={() => {
          const s = editValue;

          if (s === undefined || s === '') {
            // still a valid value, meaning "default"
            commit(undefined);
            setEditValue('');
            return;
          }

          const n = Number(s);
          if (!Number.isFinite(n)) {
            commit(undefined);
            setEditValue('');
            return;
          }
          commit(n);
        }}
      />

      {p.addonAfter && <InputRightAddon p="0">{p.addonAfter}</InputRightAddon>}
    </InputGroup>
  );
}

export type RetentionTimeUnit = keyof typeof timeFactors;
const timeFactors = {
  default: -1,
  infinite: Number.POSITIVE_INFINITY,

  ms: 1,
  seconds: 1000,
  minutes: 1000 * 60,
  hours: 1000 * 60 * 60,
  days: 1000 * 60 * 60 * 24,
  months: 1000 * 60 * 60 * 24 * (365 / 12),
  years: 1000 * 60 * 60 * 24 * 365,
} as const;

function RetentionTimeSelect(p: {
  value: number;
  unit: RetentionTimeUnit;
  onChangeValue: (v: number) => void;
  onChangeUnit: (u: RetentionTimeUnit) => void;
  defaultConfigValue?: string | undefined;
}) {
  const { value, unit } = p;
  const numDisabled = unit === 'default' || unit === 'infinite';

  let placeholder: string | undefined;
  if (unit === 'default' && p.defaultConfigValue != null) {
    if (Number.isFinite(Number(p.defaultConfigValue)))
      placeholder = prettyMilliseconds(p.defaultConfigValue, {
        showLargeAsInfinite: true,
        showNullAs: 'default',
        verbose: true,
        unitCount: 2,
      });
    else placeholder = 'default';
  }
  if (unit === 'infinite') placeholder = 'Infinite';

  return (
    <NumInput
      value={numDisabled ? undefined : value}
      onChange={(x) => p.onChangeValue(x ?? 0)}
      min={0}
      placeholder={placeholder}
      disabled={numDisabled}
      addonAfter={
        <Box minWidth="130px">
          <Select<RetentionTimeUnit>
            // style={{ minWidth: '90px', background: 'transparent' }}
            // bordered={false}
            value={{ value: unit }}
            onChange={(arg) => {
              if (isSingleValue(arg) && arg && arg.value) {
                const u = arg.value;

                if (u === 'default') {
                  // * -> default
                  // save as milliseconds
                  p.onChangeValue(value * timeFactors[unit]);
                } else {
                  // * -> real
                  // convert to new unit
                  const factor = unit === 'default' ? 1 : timeFactors[unit];
                  const ms = value * factor;
                  let newValue = ms / timeFactors[u];
                  if (Number.isNaN(newValue)) newValue = 0;
                  if (/\.\d{4,}/.test(String(newValue))) newValue = Math.round(newValue);
                  p.onChangeValue(newValue);
                }
                p.onChangeUnit(u);
              }
            }}
            options={Object.entries(timeFactors).map(([name]) => {
              const isSpecial = name === 'default' || name === 'infinite';
              return {
                value: name as RetentionTimeUnit,
                label: isSpecial ? titleCase(name) : name,
                // style: isSpecial ? { fontStyle: 'italic' } : undefined,
              };
            })}
          />
        </Box>
      }
    />
  );
}

export type RetentionSizeUnit = keyof typeof sizeFactors;
const sizeFactors = {
  default: -1,
  infinite: Number.POSITIVE_INFINITY,

  Bit: 1,
  KiB: 1024,
  MiB: 1024 * 1024,
  GiB: 1024 * 1024 * 1024,
  TiB: 1024 * 1024 * 1024 * 1024,
} as const;

function RetentionSizeSelect(p: {
  value: number;
  unit: RetentionSizeUnit;
  onChangeValue: (v: number) => void;
  onChangeUnit: (u: RetentionSizeUnit) => void;
  defaultConfigValue?: string | undefined;
}) {
  const { value, unit } = p;
  const numDisabled = unit === 'default' || unit === 'infinite';

  let placeholder: string | undefined;
  if (unit === 'default') {
    if (p.defaultConfigValue != null && p.defaultConfigValue !== '' && Number.isFinite(Number(p.defaultConfigValue))) {
      placeholder = prettyBytes(p.defaultConfigValue, { showLargeAsInfinite: true, showNullAs: 'default' });
    } else {
      placeholder = 'default';
    }
  }
  if (unit === 'infinite') placeholder = 'Infinite';

  return (
    <NumInput
      value={numDisabled ? undefined : value}
      onChange={(x) => p.onChangeValue(x ?? -1)}
      min={0}
      placeholder={placeholder}
      disabled={numDisabled}
      addonAfter={
        <Box minWidth="130px">
          <Select<RetentionSizeUnit>
            // style={{ minWidth: '90px', background: 'transparent' }}
            // bordered={false}
            value={{ value: unit }}
            onChange={(arg) => {
              if (isSingleValue(arg) && arg && arg.value) {
                const u = arg.value;

                if (u === 'default') {
                  // * -> default
                  // save as milliseconds
                  p.onChangeValue(value * sizeFactors[unit]);
                } else {
                  // * -> real
                  // convert to new unit
                  const factor = unit === 'default' ? 1 : sizeFactors[unit];
                  const ms = value * factor;
                  let newValue = ms / sizeFactors[u];
                  if (Number.isNaN(newValue)) newValue = 0;
                  if (/\.\d{4,}/.test(String(newValue))) newValue = Math.round(newValue);
                  p.onChangeValue(newValue);
                }
                p.onChangeUnit(u);
              }
            }}
            options={Object.entries(sizeFactors).map(([name]) => {
              const isSpecial = name === 'default' || name === 'infinite';
              return {
                value: name as RetentionSizeUnit,
                label: isSpecial ? titleCase(name) : name,
                // style: isSpecial ? { fontStyle: 'italic' } : undefined,
              };
            })}
          />
        </Box>
      }
    />
  );
}

const KeyValuePairEditor = observer((p: { entries: TopicConfigEntry[] }) => {
  return (
    <div className="keyValuePairEditor">
      {p.entries.map((x, i) => (
        <KeyValuePair key={String(i)} entries={p.entries} entry={x} />
      ))}

      <Button
        variant="outline"
        size="sm"
        className="addButton"
        onClick={() => {
          p.entries.push({ name: '', value: '' });
        }}
      >
        <PlusIcon />
        Add Entry
      </Button>
    </div>
  );
});

const KeyValuePair = observer((p: { entries: TopicConfigEntry[]; entry: TopicConfigEntry }) => {
  const { entry } = p;

  return (
    <Box className="inputGroup" width="100%" display="flex">
      <Input
        placeholder="Property Name..."
        style={{ flexBasis: '30%' }}
        spellCheck={false}
        value={entry.name}
        onChange={(e) => (entry.name = e.target.value)}
      />
      <Input
        placeholder="Property Value..."
        style={{ flexBasis: '60%' }}
        spellCheck={false}
        value={entry.value}
        onChange={(e) => (p.entry.value = e.target.value)}
      />
      <Button
        variant="outline"
        className="iconButton deleteButton"
        onClick={(event) => {
          event.stopPropagation();
          p.entries.remove(p.entry);
        }}
      >
        <XIcon />
      </Button>
    </Box>
  );
});

export type { Props as CreateTopicModalProps };
export type { CreateTopicModalState };

export type DataSizeUnit = keyof typeof dataSizeFactors;
const dataSizeFactors = {
  infinite: -1,

  Bytes: 1,
  KiB: 1024,
  MiB: 1024 * 1024,
  GiB: 1024 * 1024 * 1024,
  TiB: 1024 * 1024 * 1024 * 1024,
} as const;

export type DurationUnit = keyof typeof durationFactors;
const durationFactors = {
  infinite: -1,

  ms: 1,
  seconds: 1000,
  minutes: 1000 * 60,
  hours: 1000 * 60 * 60,
  days: 1000 * 60 * 60 * 24,
  months: 1000 * 60 * 60 * 24 * (365 / 12),
  years: 1000 * 60 * 60 * 24 * 365,
} as const;

@observer
class UnitSelect<UnitType extends string> extends Component<{
  baseValue: number;
  unitFactors: { [index in UnitType]: number };
  onChange: (baseValue: number) => void;
  allowInfinite: boolean;
  className?: string;
}> {
  @observable unit: UnitType;

  constructor(p: any) {
    super(p);

    const value = this.props.baseValue;

    // Find best initial unit, simply by chosing the shortest text representation
    const textPairs = Object.entries(this.props.unitFactors)
      .map(([unit, factor]) => ({
        unit: unit as UnitType,
        factor: factor as number,
      }))
      .filter((x) => {
        if (x.unit === 'default') return false;
        if (x.unit === 'infinite') return false;
        return true;
      })
      .map((x) => ({
        ...x,
        text: String(value / x.factor),
      }))
      .orderBy((x) => x.text.length);

    const shortestPair = textPairs[0];
    this.unit = shortestPair.unit;

    if (this.props.allowInfinite && value < 0) {
      this.unit = 'infinite' as UnitType;
    }

    makeObservable(this);
  }

  render() {
    const unitFactors = this.props.unitFactors;
    const unit = this.unit;
    const unitValue = this.props.baseValue / unitFactors[unit];

    const numDisabled = unit === 'infinite';

    let placeholder: string | undefined;
    if (unit === 'infinite') placeholder = 'Infinite';

    const selectOptions = Object.entries(unitFactors).map(([name]) => {
      const isSpecial = name === 'infinite';
      return {
        value: name as UnitType,
        label: isSpecial ? titleCase(name) : name,
        // style: isSpecial ? { fontStyle: 'italic' } : undefined,
      };
    });

    if (!this.props.allowInfinite) selectOptions.removeAll((x) => x.value === 'infinite');

    return (
      <NumInput
        className={this.props.className}
        value={numDisabled ? undefined : unitValue}
        onChange={(x) => {
          if (x === undefined) {
            this.props.onChange(0);
            return;
          }

          const factor = unitFactors[this.unit];
          const bytes = x * factor;
          this.props.onChange(bytes);
        }}
        min={0}
        placeholder={placeholder}
        disabled={numDisabled}
        addonAfter={
          <Select<UnitType>
            // style={{ minWidth: '90px' }}
            value={{ value: unit }}
            onChange={(arg) => {
              if (isSingleValue(arg) && arg) {
                const u = arg.value as UnitType;
                const changedFromInfinite = this.unit === 'infinite' && u !== 'infinite';

                this.unit = u;
                if (this.unit === 'infinite') this.props.onChange(unitFactors[this.unit]);

                if (changedFromInfinite) {
                  // Example: if new unit is "seconds", then we'd want 1000 ms
                  // The "1*" is redundant of course, but left in to better clarify what
                  // value we're trying to create and why
                  const newValue = 1 * unitFactors[u];
                  this.props.onChange(newValue);
                }
              }
            }}
            options={selectOptions}
          />
        }
      />
    );
  }
}

export function DataSizeSelect(p: {
  valueBytes: number;
  onChange: (ms: number) => void;
  allowInfinite: boolean;
  className?: string;
}) {
  return (
    <UnitSelect
      baseValue={p.valueBytes}
      onChange={p.onChange}
      allowInfinite={p.allowInfinite}
      unitFactors={dataSizeFactors}
      className={p.className}
    />
  );
}

export function DurationSelect(p: {
  valueMilliseconds: number;
  onChange: (ms: number) => void;
  allowInfinite: boolean;
  className?: string;
}) {
  return (
    <UnitSelect
      baseValue={p.valueMilliseconds}
      onChange={p.onChange}
      allowInfinite={p.allowInfinite}
      unitFactors={durationFactors}
      className={p.className}
    />
  );
}

export function RatioInput(p: {
  value: number;
  onChange: (ratio: number) => void;
}) {
  return (
    <Flex alignItems="center" gap={2}>
      <Slider min={0} max={100} step={1} onChange={(x) => p.onChange(x / 100)} value={Math.round(p.value * 100)}>
        <SliderTrack>
          <SliderFilledTrack />
        </SliderTrack>
        <SliderThumb />
      </Slider>
      <NumberInput
        min={0}
        max={100}
        value={`${Math.round(p.value * 100)}%`}
        onChange={(x) => {
          if (x === null) {
            return;
          }
          p.onChange(Number(x) / 100);
        }}
        size="small"
      />
    </Flex>
  );
}
