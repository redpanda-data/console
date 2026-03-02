import type React from 'react';
import { type ReactElement, type ReactNode, useEffect, useReducer, useRef, useState } from 'react';

import type { TopicConfigEntry } from '../../../../state/rest-interfaces';
import { Label } from '../../../../utils/tsx-utils';
import { prettyBytes, prettyMilliseconds, titleCase } from '../../../../utils/utils';
import './CreateTopicModal.scss';
import {
  Box,
  Button,
  CopyButton,
  Flex,
  Grid,
  Input,
  InputGroup,
  InputLeftAddon,
  InputRightAddon,
  isSingleValue,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Result,
  Select,
  Text,
  VStack,
} from '@redpanda-data/ui';
import { CloseIcon, PlusIcon } from 'components/icons';
import { useCreateTopicMutation } from 'react-query/api/topic';

import { isServerless } from '../../../../config';
import { api } from '../../../../state/backend-api';
import {
  type RetentionSizeUnit,
  type RetentionTimeUnit,
  sizeFactors,
  timeFactors,
  validateReplicationFactor,
} from '../../../../utils/topic-utils';
import { SingleSelect } from '../../../misc/select';
import { Input as UIInput } from '../../../redpanda-ui/components/input';
import { Label as UILabel } from '../../../redpanda-ui/components/label';
import { Slider as UISlider } from '../../../redpanda-ui/components/slider';
import type { CleanupPolicyType } from '../types';

// Regex for checking if value has 4 or more decimal places
const DECIMAL_PLACES_REGEX = /\.\d{4,}/;

// Regex for validating topic names
const TOPIC_NAME_REGEX = /^\S+$/;

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

export function CreateTopicModalContent({ state }: Props) {
  let replicationFactorError = '';
  if (api.clusterOverview && state.replicationFactor !== null && state.replicationFactor !== undefined) {
    replicationFactorError = validateReplicationFactor(state.replicationFactor, api.isRedpanda);
  }

  return (
    <div className="createTopicModal">
      <div style={{ display: 'flex', gap: '2em', flexDirection: 'column' }}>
        <Label text="Topic Name">
          <Input
            autoFocus
            data-testid="topic-name"
            onChange={(e) => {
              state.topicName = e.target.value;
            }}
            value={state.topicName}
            width="100%"
          />
        </Label>

        <div style={{ display: 'flex', gap: '2em' }}>
          <Label style={{ flexBasis: '160px' }} text="Partitions">
            <NumInput
              data-testid="topic-partitions"
              min={1}
              onChange={(e) => {
                state.partitions = e;
              }}
              placeholder={state.defaults.partitions}
              value={state.partitions}
            />
          </Label>
          <Label style={{ flexBasis: '160px' }} text="Replication Factor">
            <Box>
              <NumInput
                data-testid="topic-replication-factor"
                disabled={isServerless()}
                min={1}
                onChange={(e) => {
                  state.replicationFactor = e;
                }}
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
                data-testid="topic-min-insync-replicas"
                min={1}
                onChange={(e) => {
                  state.minInSyncReplicas = e;
                }}
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
                onChange={(e) => {
                  state.cleanupPolicy = e;
                }}
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
              data-testid="topic-retention-time"
              defaultConfigValue={state.defaults.retentionTime}
              onChangeUnit={(x) => {
                state.retentionTimeUnit = x;
              }}
              onChangeValue={(x) => {
                state.retentionTimeMs = x;
              }}
              unit={state.retentionTimeUnit}
              value={state.retentionTimeMs}
            />
          </Label>
          <Label style={{ flexBasis: '220px', flexGrow: 1 }} text="Retention Size">
            <RetentionSizeSelect
              data-testid="topic-retention-size"
              defaultConfigValue={state.defaults.retentionBytes}
              onChangeUnit={(x) => {
                state.retentionSizeUnit = x;
              }}
              onChangeValue={(x) => {
                state.retentionSize = x;
              }}
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
  'data-testid'?: string;
}) {
  // We need to keep track of intermediate values.
  // Otherwise, typing '2e' for example, would be rejected.
  // But the user might still add '5', and '2e5' is a valid number.
  const [editValue, setEditValue] = useState(p.value === undefined ? undefined : String(p.value));
  useEffect(() => setEditValue(p.value === undefined ? undefined : String(p.value)), [p.value]);

  const commit = (x: number | undefined) => {
    if (p.disabled) {
      return;
    }
    let clampedValue = x;
    if (
      clampedValue !== null &&
      clampedValue !== undefined &&
      p.min !== null &&
      p.min !== undefined &&
      clampedValue < p.min
    ) {
      clampedValue = p.min;
    }
    if (
      clampedValue !== null &&
      clampedValue !== undefined &&
      p.max !== null &&
      p.max !== undefined &&
      clampedValue > p.max
    ) {
      clampedValue = p.max;
    }
    setEditValue(clampedValue === undefined ? clampedValue : String(clampedValue));
    p.onChange?.(clampedValue);
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
      {Boolean(p.addonBefore) && <InputLeftAddon>{p.addonBefore}</InputLeftAddon>}

      <Input
        className={`numericInput ${p.className ?? ''}`}
        data-testid={p['data-testid']}
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
        value={p.disabled && p.placeholder && p.value === undefined ? undefined : editValue}
      />

      {Boolean(p.addonAfter) && <InputRightAddon p="0">{p.addonAfter}</InputRightAddon>}
    </InputGroup>
  );
}

function RetentionTimeSelect(p: {
  value: number;
  unit: RetentionTimeUnit;
  onChangeValue: (v: number) => void;
  onChangeUnit: (u: RetentionTimeUnit) => void;
  defaultConfigValue?: string | undefined;
  'data-testid'?: string;
}) {
  const { value, unit } = p;
  const numDisabled = unit === 'default' || unit === 'infinite';

  let placeholder: string | undefined;
  if (unit === 'default' && p.defaultConfigValue !== null && p.defaultConfigValue !== undefined) {
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
            // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
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
      data-testid={p['data-testid']}
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
  'data-testid'?: string;
}) {
  const { value, unit } = p;
  const numDisabled = unit === 'default' || unit === 'infinite';

  let placeholder: string | undefined;
  if (unit === 'default') {
    if (
      p.defaultConfigValue !== undefined &&
      p.defaultConfigValue !== '' &&
      Number.isFinite(Number(p.defaultConfigValue))
    ) {
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
            // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
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
      data-testid={p['data-testid']}
      disabled={numDisabled}
      min={0}
      onChange={(x) => p.onChangeValue(x ?? -1)}
      placeholder={placeholder}
      value={numDisabled ? undefined : value}
    />
  );
}

const KeyValuePairEditor = (p: { entries: TopicConfigEntry[] }) => (
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
);

const KeyValuePair = (p: { entries: TopicConfigEntry[]; entry: TopicConfigEntry }) => {
  const { entry } = p;

  return (
    <Box className="inputGroup" display="flex" width="100%">
      <Input
        onChange={(e) => {
          entry.name = e.target.value;
        }}
        placeholder="Property Name..."
        spellCheck={false}
        style={{ flexBasis: '30%' }}
        value={entry.name}
      />
      <Input
        onChange={(e) => {
          p.entry.value = e.target.value;
        }}
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
        <CloseIcon />
      </Button>
    </Box>
  );
};

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

function UnitSelect<UnitType extends string>(props: {
  baseValue: number;
  unitFactors: { [index in UnitType]: number };
  onChange: (baseValue: number) => void;
  allowInfinite: boolean;
  className?: string;
}) {
  // Find best initial unit, simply by choosing the shortest text representation
  const getInitialUnit = () => {
    const value = props.baseValue;
    const textPairs = Object.entries(props.unitFactors)
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
    let initialUnit = shortestPair.unit;

    if (props.allowInfinite && value < 0) {
      initialUnit = 'infinite' as UnitType;
    }

    return initialUnit;
  };

  const [unit, setUnit] = useState<UnitType>(getInitialUnit());

  const unitFactors = props.unitFactors;
  const unitValue = props.baseValue / unitFactors[unit];

  const numDisabled = unit === 'infinite';

  let placeholder: string | undefined;
  if (unit === 'infinite') {
    placeholder = 'Infinite';
  }

  const selectOptions = Object.entries(unitFactors)
    .map(([name]) => {
      const isSpecial = name === 'infinite';
      return {
        value: name as UnitType,
        label: isSpecial ? titleCase(name) : name,
        // style: isSpecial ? { fontStyle: 'italic' } : undefined,
      };
    })
    .filter((x) => props.allowInfinite || x.value !== 'infinite');

  return (
    <NumInput
      addonAfter={
        <Select<UnitType>
          // style={{ minWidth: '90px' }}
          onChange={(arg) => {
            if (isSingleValue(arg) && arg) {
              const u = arg.value as UnitType;
              const changedFromInfinite = unit === 'infinite' && u !== 'infinite';

              setUnit(u);
              if (u === 'infinite') {
                props.onChange(unitFactors[u]);
              }

              if (changedFromInfinite) {
                // Example: if new unit is "seconds", then we'd want 1000 ms
                // The "1*" is redundant of course, but left in to better clarify what
                // value we're trying to create and why
                const newValue = 1 * unitFactors[u];
                props.onChange(newValue);
              }
            }
          }}
          options={selectOptions}
          value={{ value: unit }}
        />
      }
      className={props.className}
      disabled={numDisabled}
      min={0}
      onChange={(x) => {
        if (x === undefined) {
          props.onChange(0);
          return;
        }

        const factor = unitFactors[unit];
        const bytes = x * factor;
        props.onChange(bytes);
      }}
      placeholder={placeholder}
      value={numDisabled ? undefined : unitValue}
    />
  );
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
          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground text-sm">
            %
          </span>
        </div>
      </div>
    </div>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
function getRetentionTimeFinalValue(value: number | undefined, unit: RetentionTimeUnit) {
  if (unit === 'default') {
    return;
  }

  if (value === undefined) {
    throw new Error(`unexpected: value for retention time is 'undefined' but unit is set to ${unit}`);
  }

  if (unit === 'ms') return value;
  if (unit === 'seconds') return value * 1000;
  if (unit === 'minutes') return value * 1000 * 60;
  if (unit === 'hours') return value * 1000 * 60 * 60;
  if (unit === 'days') return value * 1000 * 60 * 60 * 24;
  if (unit === 'months') return value * 1000 * 60 * 60 * 24 * (365 / 12);
  if (unit === 'years') return value * 1000 * 60 * 60 * 24 * 365;
  if (unit === 'infinite') return -1;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
function getRetentionSizeFinalValue(value: number | undefined, unit: RetentionSizeUnit) {
  if (unit === 'default') {
    return;
  }

  if (value === undefined) {
    throw new Error(`unexpected: value for retention size is 'undefined' but unit is set to ${unit}`);
  }

  if (unit === 'Bit') return value;
  if (unit === 'KiB') return value * 1024;
  if (unit === 'MiB') return value * 1024 * 1024;
  if (unit === 'GiB') return value * 1024 * 1024 * 1024;
  if (unit === 'TiB') return value * 1024 * 1024 * 1024 * 1024;
  if (unit === 'infinite') return -1;
}

function createInitialState(tryGetBrokerConfig: (name: string) => string | undefined): CreateTopicModalState {
  return {
    topicName: '',
    retentionTimeMs: 1,
    retentionTimeUnit: 'default',
    retentionSize: 1,
    retentionSizeUnit: 'default',
    partitions: undefined,
    cleanupPolicy: 'delete',
    minInSyncReplicas: undefined,
    replicationFactor: undefined,
    additionalConfig: [{ name: '', value: '' }],
    defaults: {
      get retentionTime() {
        return tryGetBrokerConfig('log.retention.ms');
      },
      get retentionBytes() {
        return tryGetBrokerConfig('log.retention.bytes');
      },
      get replicationFactor() {
        return tryGetBrokerConfig('default.replication.factor');
      },
      get partitions() {
        return tryGetBrokerConfig('num.partitions');
      },
      get cleanupPolicy() {
        return tryGetBrokerConfig('log.cleanup.policy');
      },
      get minInSyncReplicas() {
        return '1';
      },
    },
    hasErrors: false,
  };
}

export function CreateTopicModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { mutateAsync: createTopic } = useCreateTopicMutation();
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ error?: unknown; returnValue?: ReactElement } | null>(null);

  const tryGetBrokerConfig = (configName: string): string | undefined =>
    api.clusterInfo?.brokers?.find((_) => true)?.config.configs?.find((x) => x.name === configName)?.value ?? undefined;

  const stateRef = useRef<CreateTopicModalState>(createInitialState(tryGetBrokerConfig));

  const state = new Proxy(stateRef.current, {
    set(target, prop, value) {
      // biome-ignore lint/suspicious/noExplicitAny: proxy trap requires any
      (target as any)[prop] = value;
      forceUpdate();
      return true;
    },
  }) as CreateTopicModalState;

  useEffect(() => {
    if (isOpen) {
      api.refreshCluster();
      stateRef.current = createInitialState(tryGetBrokerConfig);
      setResult(null);
      forceUpdate();
    }
  }, [isOpen]);

  const isOkEnabled = TOPIC_NAME_REGEX.test(state.topicName) && !state.hasErrors;

  const handleClose = () => {
    setResult(null);
    onClose();
  };

  const handleOk = async () => {
    if (result?.error) {
      setResult(null);
      return;
    }

    const currentState = stateRef.current;

    setIsLoading(true);
    try {
      if (!currentState.topicName) {
        throw new Error('"Topic Name" must be set');
      }
      if (!currentState.cleanupPolicy) {
        throw new Error('"Cleanup Policy" must be set');
      }

      const config: { name: string; value: string }[] = [];
      const setVal = (name: string, value: string | number | undefined) => {
        if (value === undefined) return;
        config.removeAll((x) => x.name === name);
        config.push({ name, value: String(value) });
      };

      for (const x of currentState.additionalConfig) {
        setVal(x.name, x.value);
      }

      if (currentState.retentionTimeUnit !== 'default') {
        setVal(
          'retention.ms',
          getRetentionTimeFinalValue(currentState.retentionTimeMs, currentState.retentionTimeUnit)
        );
      }
      if (currentState.retentionSizeUnit !== 'default') {
        setVal(
          'retention.bytes',
          getRetentionSizeFinalValue(currentState.retentionSize, currentState.retentionSizeUnit)
        );
      }
      if (currentState.minInSyncReplicas !== undefined) {
        setVal('min.insync.replicas', currentState.minInSyncReplicas);
      }

      setVal('cleanup.policy', currentState.cleanupPolicy);

      const apiResult = await createTopic({
        topic: {
          name: currentState.topicName,
          partitionCount: currentState.partitions ?? Number(currentState.defaults.partitions ?? '-1'),
          replicationFactor: currentState.replicationFactor ?? Number(currentState.defaults.replicationFactor ?? '-1'),
          configs: config.filter((x) => x.name.length > 0).map((x) => ({ name: x.name, value: x.value })),
        },
        validateOnly: false,
      });

      const returnValue = (
        <Grid
          alignItems="center"
          columnGap={2}
          justifyContent="center"
          justifyItems="flex-end"
          py={2}
          rowGap={1}
          templateColumns="auto auto"
        >
          <Text>Name:</Text>
          <Flex alignItems="center" gap={2} justifySelf="start">
            <Text noOfLines={1} whiteSpace="break-spaces" wordBreak="break-word">
              {apiResult.topicName}
            </Text>
            <CopyButton content={apiResult.topicName} variant="ghost" />
          </Flex>
          <Text>Partitions:</Text>
          <Text justifySelf="start">{String(apiResult.partitionCount).replace('-1', '(Default)')}</Text>
          <Text>Replication Factor:</Text>
          <Text justifySelf="start">{String(apiResult.replicationFactor).replace('-1', '(Default)')}</Text>
        </Grid>
      );

      setResult({ returnValue, error: undefined });

      api.refreshClusterOverview();
      api.refreshClusterHealth().catch(() => {
        // Error handling managed by API layer
      });
    } catch (e) {
      setResult({ error: e });
    } finally {
      setIsLoading(false);
    }
  };

  const renderError = (err: unknown): ReactElement => {
    let content: ReactNode;
    let title = 'Error';
    const codeBoxStyle = {
      fontSize: '12px',
      fontFamily: 'monospace',
      color: 'hsl(0deg 0% 25%)',
      margin: '0em 1em',
    };

    if (typeof err === 'string') {
      content = <div style={codeBoxStyle}>{err}</div>;
    } else if (err instanceof Error) {
      title = err.name;
      content = <div style={codeBoxStyle}>{err.message}</div>;
    } else {
      content = <div style={codeBoxStyle}>{JSON.stringify(err, null, 4)}</div>;
    }

    return <Result extra={content} status="error" title={title} />;
  };

  const renderSuccess = (response: ReactElement | undefined) => (
    <Result
      extra={
        <VStack>
          <Box>{response}</Box>
          <Button
            data-testid="create-topic-success__close-button"
            onClick={handleClose}
            size="lg"
            style={{ width: '16rem' }}
            variant="solid"
          >
            Close
          </Button>
        </VStack>
      }
      status="success"
      title="Topic created!"
    />
  );

  let content: ReactElement;
  let modalState: 'error' | 'success' | 'normal' = 'normal';

  if (result) {
    if (result.error) {
      modalState = 'error';
      content = renderError(result.error);
    } else {
      modalState = 'success';
      content = renderSuccess(result.returnValue);
    }
  } else {
    content = <CreateTopicModalContent state={state} />;
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <ModalOverlay />
      <ModalContent
        style={{
          width: '80%',
          minWidth: '600px',
          maxWidth: '1000px',
          top: '50px',
          paddingTop: '10px',
          paddingBottom: '10px',
        }}
      >
        {modalState !== 'success' && <ModalHeader>Create Topic</ModalHeader>}
        <ModalBody>{content}</ModalBody>
        {modalState !== 'success' && (
          <ModalFooter>
            <Flex gap={2}>
              {modalState === 'normal' && (
                <Button onClick={handleClose} variant="ghost">
                  Cancel
                </Button>
              )}
              <Button
                data-testid="onOk-button"
                isDisabled={!isOkEnabled}
                isLoading={isLoading}
                onClick={handleOk}
                variant="solid"
              >
                {modalState === 'error' ? 'Back' : 'Create'}
              </Button>
            </Flex>
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  );
}
