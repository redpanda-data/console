// Copyright 2026 Redpanda Data, Inc.

import { Group } from 'components/redpanda-ui/components/group';
import { Input, InputEnd } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Slider } from 'components/redpanda-ui/components/slider';
import type { ReactElement } from 'react';
import { useEffect, useId, useState } from 'react';

import type { ConfigEntryExtended } from '../../../state/rest-interfaces';
import { isNonzeroNumber } from '../../../utils/number-utils';
import { isNonEmptyString } from '../../../utils/string-utils';

export const ConfigEntryEditorController = (p: {
  entry: ConfigEntryExtended;
  value: string | number | null | undefined;
  onChange: (e: string | number | null | undefined) => void;
  className?: string;
  /** Id for the entry's primary labellable control. */
  id?: string;
}) => {
  const { entry, value, onChange } = p;
  switch (entry.frontendFormat) {
    case 'BOOLEAN':
      return (
        <Select onValueChange={(v) => onChange(v)} value={String(value)}>
          <SelectTrigger id={p.id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="false">False</SelectItem>
            <SelectItem value="true">True</SelectItem>
          </SelectContent>
        </Select>
      );

    case 'SELECT':
      return (
        <Select onValueChange={(v) => onChange(v)} value={String(value)}>
          <SelectTrigger className={p.className} id={p.id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(entry.enumValues ?? []).map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'BYTE_SIZE':
      return <DataSizeSelect id={p.id} onChange={(e) => onChange(Math.round(e))} valueBytes={Number(value ?? 0)} />;

    case 'DURATION':
      return (
        <DurationSelect id={p.id} onChange={(e) => onChange(Math.round(e))} valueMilliseconds={Number(value ?? 0)} />
      );

    case 'PASSWORD':
      return <Input id={p.id} onChange={(x) => onChange(x.target.value)} type="password" value={String(value ?? '')} />;

    case 'RATIO': {
      const hasValue = typeof value === 'number' ? isNonzeroNumber(value) : isNonEmptyString(value);
      return <RatioInput id={p.id} onChange={onChange} value={Number(hasValue ? value : entry.value)} />;
    }

    case 'INTEGER':
      return <NumInput id={p.id} onChange={(e) => onChange(Math.round(e ?? 0))} value={Number(value)} />;

    case 'DECIMAL':
      return <NumInput id={p.id} onChange={(e) => onChange(e)} value={Number(value)} />;

    case undefined:
    case 'MULTI_SELECT':
    case 'STRING':
    default:
      return <Input id={p.id} onChange={(e) => onChange(e.target.value)} value={String(value)} />;
  }
};

// ── Local input helpers ────────────────────────────────────────────────────────

function NumInput(p: {
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
  addonAfter?: ReactElement;
  id?: string;
}) {
  const [editValue, setEditValue] = useState(p.value === undefined ? undefined : String(p.value));
  useEffect(() => setEditValue(p.value === undefined ? undefined : String(p.value)), [p.value]);

  const commit = (x: number | undefined) => {
    if (p.disabled === true) {
      return;
    }
    let v = x;
    if (v !== undefined && p.min !== undefined && v < p.min) {
      v = p.min;
    }
    if (v !== undefined && p.max !== undefined && v > p.max) {
      v = p.max;
    }
    setEditValue(v === undefined ? undefined : String(v));
    p.onChange?.(v);
  };

  const input = (
    <Input
      className={p.addonAfter ? 'flex-1' : undefined}
      disabled={p.disabled}
      id={p.id}
      onBlur={() => {
        if (!(editValue !== null && editValue !== undefined && editValue !== '')) {
          commit(undefined);
          setEditValue('');
          return;
        }
        const n = Number(editValue);
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
      onWheel={(e) => commit(Math.round((p.value ?? 0) - Math.sign(e.deltaY)))}
      placeholder={p.placeholder}
      spellCheck={false}
      value={p.disabled === true && isNonEmptyString(p.placeholder) && p.value === undefined ? '' : (editValue ?? '')}
    />
  );

  if (!p.addonAfter) {
    return input;
  }
  // An attached group joins the input and its addon into one control.
  return (
    <Group attached>
      {input}
      {p.addonAfter}
    </Group>
  );
}

function UnitInput({
  baseValue,
  unitFactors,
  onChange,
  id,
}: {
  baseValue: number;
  unitFactors: Readonly<Record<string, number>>;
  onChange: (v: number) => void;
  id?: string;
}) {
  const options = Object.entries(unitFactors).map(([unit, factor]) => ({ unit, factor }));
  const getInitialUnit = () => {
    const selected = options
      .toSorted((a, b) => String(baseValue / a.factor).length - String(baseValue / b.factor).length)
      .at(0);
    if (selected === undefined) {
      throw new Error('Unit input requires at least one conversion factor');
    }
    return selected;
  };
  const [selected, setSelected] = useState(getInitialUnit);
  return (
    <NumInput
      addonAfter={
        <Select
          onValueChange={(unit) => {
            const next = options.find((option) => option.unit === unit);
            if (next) {
              setSelected(next);
            }
          }}
          value={selected.unit}
        >
          <SelectTrigger className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map(({ unit }) => (
              <SelectItem key={unit} value={unit}>
                {unit}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      id={id}
      min={0}
      onChange={(value) => onChange((value ?? 0) * selected.factor)}
      value={baseValue / selected.factor}
    />
  );
}

const dataSizeFactors = {
  Bytes: 1,
  KiB: 1024,
  MiB: 1024 * 1024,
  GiB: 1024 * 1024 * 1024,
  TiB: 1024 * 1024 * 1024 * 1024,
} as const;

const durationFactors = {
  ms: 1,
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
} as const;

function DataSizeSelect(p: { valueBytes: number; onChange: (v: number) => void; id?: string }) {
  return <UnitInput baseValue={p.valueBytes} id={p.id} onChange={p.onChange} unitFactors={dataSizeFactors} />;
}

function DurationSelect(p: { valueMilliseconds: number; onChange: (v: number) => void; id?: string }) {
  return <UnitInput baseValue={p.valueMilliseconds} id={p.id} onChange={p.onChange} unitFactors={durationFactors} />;
}

function RatioInput(p: { value: number; onChange: (ratio: number) => void; id?: string }) {
  const pct = Math.round(p.value * 100);
  const generatedId = useId();
  const inputId = p.id ?? `${generatedId}-input`;
  const captionId = `${generatedId}-caption`;
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-label" id={captionId}>
          Percentage ({pct}%)
        </p>
        <Slider
          aria-labelledby={captionId}
          className="w-full"
          max={100}
          min={0}
          onValueChange={(values) => p.onChange(values[0] / 100)}
          step={1}
          value={[pct]}
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="whitespace-nowrap" htmlFor={inputId}>
          Precise value:
        </Label>
        <div className="relative shrink-0">
          <Input
            className="w-20 text-right"
            id={inputId}
            max={100}
            min={0}
            onChange={(e) => {
              if (e.target.value === '') {
                return;
              }
              const n = Number(e.target.value);
              if (!Number.isNaN(n) && n >= 0 && n <= 100) {
                p.onChange(n / 100);
              }
            }}
            type="number"
            value={pct}
          >
            {/* The end slot pads the input to fit the unit. */}
            <InputEnd>
              <span className="text-body text-muted-foreground">%</span>
            </InputEnd>
          </Input>
        </div>
      </div>
    </div>
  );
}
