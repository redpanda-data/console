/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { parseNumber } from '@ui-sdk/core/number';
import { DateInput } from '@ui-sdk/react/date-input';
import { Button, PlainButton } from 'components/redpanda-ui/components/button';
import { Calendar } from 'components/redpanda-ui/components/calendar';
import { Field, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input, InputEnd } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { ToggleGroup, ToggleGroupItem } from 'components/redpanda-ui/components/toggle-group';
import { CalendarIcon } from 'lucide-react';
import { useId, useState } from 'react';

export type DateTimeInputMode = 'local' | 'utc';

export type DateTimeInputProps = {
  /** UTC milliseconds, or undefined when no value is set yet. */
  value: number | undefined;
  /** Always called with UTC milliseconds, regardless of the displayed mode. */
  onChange: (utcMs: number) => void;
  disabled?: boolean;
  defaultMode?: DateTimeInputMode;
  hideTimezoneToggle?: boolean;
  /** Render the calendar/time panel as normal flowed content below the input instead of behind a click-to-open popup — for callers that are already inside their own popup and don't want a nested one. */
  inline?: boolean;
  className?: string;
  placeholder?: string;
  'data-testid'?: string;
  'aria-label'?: string;
};

const MACHINE_NUMBER = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function parseTimestamp(text: string): number | null {
  const raw = text.trim();
  // A raw Unix decimal must keep its meaning even when the dot is a locale group separator.
  const parsed = MACHINE_NUMBER.test(raw) ? Number(raw) : parseNumber(raw, globalThis.navigator?.language);
  if (parsed === null) return null;

  const utcMs = Math.abs(parsed) < 1e11 ? parsed * 1000 : parsed;
  return Number.isFinite(new Date(utcMs).getTime()) ? utcMs : null;
}

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

const isFiniteNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

type DateParts = {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
};

const partsFor = (utcMs: number, mode: DateTimeInputMode): DateParts => {
  const d = new Date(utcMs);
  const utc = mode === 'utc';
  return {
    year: utc ? d.getUTCFullYear() : d.getFullYear(),
    month: utc ? d.getUTCMonth() : d.getMonth(),
    day: utc ? d.getUTCDate() : d.getDate(),
    hours: utc ? d.getUTCHours() : d.getHours(),
    minutes: utc ? d.getUTCMinutes() : d.getMinutes(),
    seconds: utc ? d.getUTCSeconds() : d.getSeconds(),
  };
};

const composeUtcMs = (parts: DateParts, mode: DateTimeInputMode): number => {
  const date = new Date(0);
  if (mode === 'utc') {
    date.setUTCHours(parts.hours, parts.minutes, parts.seconds);
    return date.setUTCFullYear(parts.year, parts.month, parts.day);
  }
  date.setHours(parts.hours, parts.minutes, parts.seconds);
  return date.setFullYear(parts.year, parts.month, parts.day);
};

type ModeToggleProps = {
  mode: DateTimeInputMode;
  onModeChange: (mode: DateTimeInputMode) => void;
};

const ModeToggle = ({ mode, onModeChange }: ModeToggleProps) => (
  <ToggleGroup
    onValueChange={(value: string[]) => {
      if (value[0]) {
        onModeChange(value[0] as DateTimeInputMode);
      }
    }}
    size="sm"
    value={[mode]}
  >
    <ToggleGroupItem value="local">Local</ToggleGroupItem>
    <ToggleGroupItem value="utc">UTC</ToggleGroupItem>
  </ToggleGroup>
);

type DateTimePickerPanelProps = {
  value: number | undefined;
  onChange: (utcMs: number) => void;
  mode: DateTimeInputMode;
  onModeChange: (mode: DateTimeInputMode) => void;
  disabled?: boolean;
  hideTimezoneToggle?: boolean;
};

const DateTimePickerPanel = ({
  value,
  onChange,
  mode,
  onModeChange,
  disabled,
  hideTimezoneToggle,
}: DateTimePickerPanelProps) => {
  const parts = partsFor(isFiniteNumber(value) ? value : Date.now(), mode);
  const dateInputValue = `${pad(parts.year, 4)}-${pad(parts.month + 1)}-${pad(parts.day)}`;
  const timeInputValue = `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;

  const setFromCalendar = (isoDay: string | null) => {
    if (!isoDay) {
      return;
    }
    // Read ISO day parts without converting midnight through the local time zone.
    const date = new Date(`${isoDay}T00:00:00Z`);
    if (!Number.isFinite(date.getTime())) {
      return;
    }
    onChange(
      composeUtcMs(
        { ...parts, year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() },
        mode
      )
    );
  };

  const setFromTime = (raw: string) => {
    const [hh, mm, ss = '0'] = raw.split(':');
    const hours = Number(hh);
    const minutes = Number(mm);
    const seconds = Number(ss);
    if (![hours, minutes, seconds].every(Number.isFinite)) {
      return;
    }
    onChange(composeUtcMs({ ...parts, hours, minutes, seconds }, mode));
  };

  return (
    <div
      className="flex flex-col gap-3"
      // Prevent base-ui from misclassifying in-popover clicks (Calendar days,
      // <input type="time">) as outside-presses that would close the popup.
      onFocus={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Field className="gap-1.5" disabled={disabled}>
        <FieldLabel>{mode === 'utc' ? 'UTC date' : 'Local date'}</FieldLabel>
        <DateInput
          className="flex min-h-9 items-center gap-0.5 rounded-md border border-input bg-background px-3 text-body focus-within:border-ring"
          locale={globalThis.navigator?.language}
          onValueChange={setFromCalendar}
          value={dateInputValue}
        />
      </Field>
      {/* Scoped override: `--color-selected` and `--color-primary` are different shades, and this
      panel's other affordances (the "Now" button) paint `primary` — repaint the selected day to
      match without touching the shared Calendar. `p-0` strips Calendar's built-in padding, which
      otherwise stacks on this panel's own spacing. */}
      <div className="[--color-selected-foreground:var(--color-primary-foreground)] [--color-selected:var(--color-primary)]">
        <Calendar
          className="p-0"
          mode="single"
          onValueChange={(date) => setFromCalendar(typeof date === 'string' ? date : null)}
          value={dateInputValue}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-2">
          <Input
            aria-label="Time"
            className="flex-1"
            disabled={disabled}
            onValueChange={(inputText) => setFromTime(inputText)}
            step={1}
            type="time"
            value={timeInputValue}
          />
          {/* variant="primary" paints `--color-primary`, the same token the selected-day
          override above repaints `--color-selected` with, so the two affordances match. */}
          <Button disabled={disabled} onClick={() => onChange(Date.now())} size="sm" type="button" variant="primary">
            Now
          </Button>
        </div>
        {!hideTimezoneToggle && <ModeToggle mode={mode} onModeChange={onModeChange} />}
      </div>
    </div>
  );
};

const DEFAULT_PLACEHOLDER = 'Enter unix timestamp';

// Text accepts Unix seconds or milliseconds; the picker always commits UTC milliseconds.
export const DateTimeInput = ({
  value,
  onChange,
  disabled,
  defaultMode = 'local',
  hideTimezoneToggle = false,
  inline = false,
  className,
  placeholder = DEFAULT_PLACEHOLDER,
  ...rest
}: DateTimeInputProps) => {
  const [mode, setMode] = useState<DateTimeInputMode>(defaultMode);
  const [draft, setDraft] = useState<string | null>(null);

  const timestampId = useId();
  const timestampLabel = rest['aria-label'] ?? 'Unix timestamp';
  const numericText = isFiniteNumber(value) ? String(value) : '';
  const displayedNumber = draft ?? numericText;

  const writeNumeric = (text: string) => {
    const utcMs = parseTimestamp(text);
    if (utcMs === null) return false;
    onChange(utcMs);
    return true;
  };
  const commitNumeric = () => {
    if (draft !== null) writeNumeric(draft);
    setDraft(null);
  };

  const panel = (
    <DateTimePickerPanel
      disabled={disabled}
      hideTimezoneToggle={hideTimezoneToggle}
      mode={mode}
      onChange={onChange}
      onModeChange={setMode}
      value={value}
    />
  );

  const numberInputProps = {
    className,
    'data-testid': rest['data-testid'],
    disabled,
    onBlur: commitNumeric,
    onValueChange: (next, details) => {
      if (details.source === 'agent') {
        if (!writeNumeric(next)) details.cancel();
        else setDraft(null);
        return;
      }
      setDraft(next);
    },
    id: timestampId,
    'aria-label': timestampLabel,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
        e.preventDefault();
        commitNumeric();
      }
    },
    placeholder,
    size: 'lg' as const,
    inputMode: 'decimal' as const,
    value: displayedNumber,
  } satisfies React.ComponentProps<typeof Input> & { 'data-testid'?: string };

  if (inline) {
    return (
      <div className="flex flex-col gap-3">
        {panel}
        <div className="flex flex-col gap-1.5">
          <Label className="text-caption uppercase tracking-wide" htmlFor={timestampId}>
            {timestampLabel}
          </Label>
          <Input {...numberInputProps}>
            <InputEnd>
              <CalendarIcon className="size-4 text-muted-foreground" />
            </InputEnd>
          </Input>
        </div>
      </div>
    );
  }

  return (
    <Popover>
      <PopoverAnchor
        render={<Input {...numberInputProps}>
          <InputEnd className="pointer-events-auto">
            <PopoverTrigger
              render={<PlainButton
                aria-label="Open calendar"
                className="text-muted-foreground hover:text-foreground"
                disabled={disabled}
                type="button"
              >
                <CalendarIcon className="size-4" />
              </PlainButton>} />
          </InputEnd>
        </Input>} />
      <PopoverContent align="start" className="w-auto p-3">
        {panel}
      </PopoverContent>
    </Popover>
  );
};
