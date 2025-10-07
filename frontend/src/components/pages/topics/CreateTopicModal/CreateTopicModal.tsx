import { PlusIcon, XIcon } from '@primer/octicons-react';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import type React from 'react';
import { Component, useEffect, useState } from 'react';

import type { TopicConfigEntry } from '../../../../state/restInterfaces';
import { Label } from '../../../../utils/tsxUtils';
import { prettyBytes, prettyMilliseconds, titleCase } from '../../../../utils/utils';
import './CreateTopicModal.scss';
import {
  Box,
  Button,
  Input,
  InputGroup,
  InputLeftAddon,
  InputRightAddon,
  isSingleValue,
  Select,
} from '@redpanda-data/ui';

import { isServerless } from '../../../../config';
import { api } from '../../../../state/backendApi';
import {
  type RetentionSizeUnit,
  type RetentionTimeUnit,
  sizeFactors,
  timeFactors,
  validateReplicationFactor,
} from '../../../../utils/topicUtils';
import { SingleSelect } from '../../../misc/Select';
import { Input as UIInput } from '../../../redpanda-ui/components/input';
import { Label as UILabel } from '../../../redpanda-ui/components/label';
import { Slider as UISlider } from '../../../redpanda-ui/components/slider';
import type { CleanupPolicyType } from '../types';

// Regex for checking if value has 4 or more decimal places
const DECIMAL_PLACES_REGEX = /\.\d{4,}/;

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
    if (api.clusterOverview && state.replicationFactor != null) {
      replicationFactorError = validateReplicationFactor(state.replicationFactor, api.isRedpanda);
    }

    return (
      <div className="createTopicModal">
        <div style={{ display: 'flex', gap: '2em', flexDirection: 'column' }}>
          <Label text="Topic Name">
            <Input
              autoFocus
              data-testid="topic-name"
              onChange={(e) => (state.topicName = e.target.value)}
              value={state.topicName}
              width="100%"
            />
          </Label>

          <div style={{ display: 'flex', gap: '2em' }}>
            <Label style={{ flexBasis: '160px' }} text="Partitions">
              <NumInput
                min={1}
                onChange={(e) => (state.partitions = e)}
                placeholder={state.defaults.partitions}
                value={state.partitions}
              />
            </Label>
            <Label style={{ flexBasis: '160px' }} text="Replication Factor">
              <Box>
                <NumInput
                  disabled={isServerless()}
                  min={1}
                  onChange={(e) => (state.replicationFactor = e)}
                  placeholder={state.defaults.replicationFactor}
                  value={state.replicationFactor}
                />
                <Box
                  color="red.500"
                  fontSize="12px"
                  fontWeight={500}
                  visibility={replicationFactorError ? undefined : 'hidden'}
                >
                  {replicationFactorError}
                </Box>
              </Box>
            </Label>

            {!api.isRedpanda && (
              <Label style={{ flexBasis: '160px' }} text="Min In-Sync Replicas">
                <NumInput
                  min={1}
                  onChange={(e) => (state.minInSyncReplicas = e)}
                  placeholder={state.defaults.minInSyncReplicas}
                  value={state.minInSyncReplicas}
                />
              </Label>
            )}
          </div>

          <div style={{ display: 'flex', gap: '2em', zIndex: 5 }}>
            {!isServerless() && (
              <Label style={{ flexBasis: '160px' }} text="Cleanup Policy">
                <SingleSelect<CleanupPolicyType>
                  isReadOnly={isServerless()}
                  onChange={(e) => (state.cleanupPolicy = e)}
                  options={[
                    { value: 'delete', label: 'delete' },
                    { value: 'compact', label: 'compact' },
                    { value: 'compact,delete', label: 'compact,delete' },
                  ]}
                  value={state.cleanupPolicy}
                />
              </Label>
            )}
            <Label style={{ flexBasis: '220px', flexGrow: 1 }} text="Retention Time">
              <RetentionTimeSelect
                defaultConfigValue={state.defaults.retentionTime}
                onChangeUnit={(x) => (state.retentionTimeUnit = x)}
                onChangeValue={(x) => (state.retentionTimeMs = x)}
                unit={state.retentionTimeUnit}
                value={state.retentionTimeMs}
              />
            </Label>
            <Label style={{ flexBasis: '220px', flexGrow: 1 }} text="Retention Size">
              <RetentionSizeSelect
                defaultConfigValue={state.defaults.retentionBytes}
                onChangeUnit={(x) => (state.retentionSizeUnit = x)}
                onChangeValue={(x) => (state.retentionSize = x)}
                unit={state.retentionSizeUnit}
                value={state.retentionSize}
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
    if (p.disabled) {
      return;
    }
    if (x != null && p.min != null && x < p.min) {
      x = p.min;
    }
    if (x != null && p.max != null && x > p.max) {
      x = p.max;
    }
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
        disabled={p.disabled}
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
        onChange={(e) => {
          setEditValue(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== '' && !Number.isNaN(n)) {
            p.onChange?.(n);
          } else {
            p.onChange?.(undefined);
          }
        }}
        onWheel={(e) => changeBy(-Math.sign(e.deltaY))}
        placeholder={p.placeholder}
        spellCheck={false}
        style={{ minWidth: '120px', width: '100%' }}
        value={p.disabled && p.placeholder && p.value == null ? undefined : editValue}
      />

      {p.addonAfter && <InputRightAddon p="0">{p.addonAfter}</InputRightAddon>}
    </InputGroup>
  );
}

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
    if (Number.isFinite(Number(p.defaultConfigValue))) {
      placeholder = prettyMilliseconds(p.defaultConfigValue, {
        showLargeAsInfinite: true,
        showNullAs: 'default',
        verbose: true,
        unitCount: 2,
      });
    } else {
      placeholder = 'default';
    }
  }
  if (unit === 'infinite') {
    placeholder = 'Infinite';
  }

  return (
    <NumInput
      addonAfter={
        <Box minWidth="130px">
          <Select<RetentionTimeUnit>
            // style={{ minWidth: '90px', background: 'transparent' }}
            // bordered={false}
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
                  if (Number.isNaN(newValue)) {
                    newValue = 0;
                  }
                  if (DECIMAL_PLACES_REGEX.test(String(newValue))) {
                    newValue = Math.round(newValue);
                  }
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
            value={{ value: unit }}
          />
        </Box>
      }
      disabled={numDisabled}
      min={0}
      onChange={(x) => p.onChangeValue(x ?? 0)}
      placeholder={placeholder}
      value={numDisabled ? undefined : value}
    />
  );
}

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
  if (unit === 'infinite') {
    placeholder = 'Infinite';
  }

  return (
    <NumInput
      addonAfter={
        <Box minWidth="130px">
          <Select<RetentionSizeUnit>
            // style={{ minWidth: '90px', background: 'transparent' }}
            // bordered={false}
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
                  if (Number.isNaN(newValue)) {
                    newValue = 0;
                  }
                  if (DECIMAL_PLACES_REGEX.test(String(newValue))) {
                    newValue = Math.round(newValue);
                  }
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
            value={{ value: unit }}
          />
        </Box>
      }
      disabled={numDisabled}
      min={0}
      onChange={(x) => p.onChangeValue(x ?? -1)}
      placeholder={placeholder}
      value={numDisabled ? undefined : value}
    />
  );
}

const KeyValuePairEditor = observer((p: { entries: TopicConfigEntry[] }) => (
  <div className="keyValuePairEditor">
    {p.entries.map((x, i) => (
      <KeyValuePair entries={p.entries} entry={x} key={String(i)} />
    ))}

    <Button
      className="addButton"
      onClick={() => {
        p.entries.push({ name: '', value: '' });
      }}
      size="sm"
      variant="outline"
    >
      <PlusIcon />
      Add Entry
    </Button>
  </div>
));

const KeyValuePair = observer((p: { entries: TopicConfigEntry[]; entry: TopicConfigEntry }) => {
  const { entry } = p;

  return (
    <Box className="inputGroup" display="flex" width="100%">
      <Input
        onChange={(e) => (entry.name = e.target.value)}
        placeholder="Property Name..."
        spellCheck={false}
        style={{ flexBasis: '30%' }}
        value={entry.name}
      />
      <Input
        onChange={(e) => (p.entry.value = e.target.value)}
        placeholder="Property Value..."
        spellCheck={false}
        style={{ flexBasis: '60%' }}
        value={entry.value}
      />
      <Button
        className="iconButton deleteButton"
        onClick={(event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
          event.stopPropagation();
          p.entries.remove(p.entry);
        }}
        variant="outline"
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
        if (x.unit === 'default') {
          return false;
        }
        if (x.unit === 'infinite') {
          return false;
        }
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
    if (unit === 'infinite') {
      placeholder = 'Infinite';
    }

    const selectOptions = Object.entries(unitFactors).map(([name]) => {
      const isSpecial = name === 'infinite';
      return {
        value: name as UnitType,
        label: isSpecial ? titleCase(name) : name,
        // style: isSpecial ? { fontStyle: 'italic' } : undefined,
      };
    });

    if (!this.props.allowInfinite) {
      selectOptions.removeAll((x) => x.value === 'infinite');
    }

    return (
      <NumInput
        addonAfter={
          <Select<UnitType>
            // style={{ minWidth: '90px' }}
            onChange={(arg) => {
              if (isSingleValue(arg) && arg) {
                const u = arg.value as UnitType;
                const changedFromInfinite = this.unit === 'infinite' && u !== 'infinite';

                this.unit = u;
                if (this.unit === 'infinite') {
                  this.props.onChange(unitFactors[this.unit]);
                }

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
            value={{ value: unit }}
          />
        }
        className={this.props.className}
        disabled={numDisabled}
        min={0}
        onChange={(x) => {
          if (x === undefined) {
            this.props.onChange(0);
            return;
          }

          const factor = unitFactors[this.unit];
          const bytes = x * factor;
          this.props.onChange(bytes);
        }}
        placeholder={placeholder}
        value={numDisabled ? undefined : unitValue}
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
      allowInfinite={p.allowInfinite}
      baseValue={p.valueBytes}
      className={p.className}
      onChange={p.onChange}
      unitFactors={dataSizeFactors}
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
      allowInfinite={p.allowInfinite}
      baseValue={p.valueMilliseconds}
      className={p.className}
      onChange={p.onChange}
      unitFactors={durationFactors}
    />
  );
}

export function RatioInput(p: { value: number; onChange: (ratio: number) => void }) {
  const percentageValue = Math.round(p.value * 100);

  const handleSliderChange = (values: number[]) => {
    p.onChange(values[0] / 100);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    if (inputValue === '') {
      return;
    }
    const numericValue = Number(inputValue);
    if (!Number.isNaN(numericValue) && numericValue >= 0 && numericValue <= 100) {
      p.onChange(numericValue / 100);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <UILabel className="font-medium text-muted-foreground text-sm">Percentage ({percentageValue}%)</UILabel>
        <UISlider
          aria-label="Percentage slider"
          className="w-full"
          max={100}
          min={0}
          onValueChange={handleSliderChange}
          step={1}
          value={[percentageValue]}
        />
      </div>
      <div className="flex items-center gap-2">
        <UILabel className="whitespace-nowrap font-medium text-sm" htmlFor="ratio-input">
          Precise value:
        </UILabel>
        <div className="relative flex-shrink-0">
          <UIInput
            aria-label="Percentage input"
            className="w-20 pr-6 text-right"
            id="ratio-input"
            max={100}
            min={0}
            onChange={handleInputChange}
            type="number"
            value={percentageValue}
          />
          <span className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-2 text-muted-foreground text-sm">
            %
          </span>
        </div>
      </div>
    </div>
  );
}
