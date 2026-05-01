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

import { Button } from 'components/redpanda-ui/components/button';
import { Calendar } from 'components/redpanda-ui/components/calendar';
import { Input, InputEnd } from 'components/redpanda-ui/components/input';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { CalendarIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

export type DateTimeInputMode = 'local' | 'utc';

export type DateTimeInputProps = {
  /** UTC milliseconds, or undefined when no value is set yet. */
  value: number | undefined;
  /** Always called with UTC milliseconds, regardless of the displayed mode. */
  onChange: (utcMs: number) => void;
  disabled?: boolean;
  defaultMode?: DateTimeInputMode;
  hideTimezoneToggle?: boolean;
  className?: string;
  placeholder?: string;
  'data-testid'?: string;
};

const MS_PER_MINUTE = 60_000;

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

// UTC mode pre-shifts by the local offset so `Date#getX` returns UTC values.
const partsFor = (utcMs: number, mode: DateTimeInputMode): DateParts => {
  const d = mode === 'utc' ? new Date(utcMs + new Date(utcMs).getTimezoneOffset() * MS_PER_MINUTE) : new Date(utcMs);
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
    hours: d.getHours(),
    minutes: d.getMinutes(),
    seconds: d.getSeconds(),
  };
};

const composeUtcMs = (parts: DateParts, mode: DateTimeInputMode): number => {
  if (mode === 'utc') {
    return Date.UTC(parts.year, parts.month, parts.day, parts.hours, parts.minutes, parts.seconds);
  }
  return new Date(parts.year, parts.month, parts.day, parts.hours, parts.minutes, parts.seconds).getTime();
};

const formatTimeInputValue = (utcMs: number, mode: DateTimeInputMode): string => {
  const p = partsFor(utcMs, mode);
  return `${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}`;
};

type ModeToggleProps = {
  mode: DateTimeInputMode;
  onModeChange: (mode: DateTimeInputMode) => void;
};

const ModeToggle = ({ mode, onModeChange }: ModeToggleProps) => (
  <div className="flex w-fit gap-1 rounded-md border p-1">
    <Button
      onClick={() => onModeChange('local')}
      size="sm"
      type="button"
      variant={mode === 'local' ? 'outline' : 'ghost'}
    >
      Local
    </Button>
    <Button onClick={() => onModeChange('utc')} size="sm" type="button" variant={mode === 'utc' ? 'outline' : 'ghost'}>
      UTC
    </Button>
  </div>
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
  const baseMs = isFiniteNumber(value) ? value : Date.now();

  const calendarSelected = useMemo(() => {
    const p = partsFor(baseMs, mode);
    return new Date(p.year, p.month, p.day);
  }, [baseMs, mode]);

  const timeInputValue = useMemo(() => formatTimeInputValue(baseMs, mode), [baseMs, mode]);

  const setFromCalendar = (next: Date | undefined) => {
    if (!next) {
      return;
    }
    const time = partsFor(baseMs, mode);
    onChange(
      composeUtcMs(
        {
          year: next.getFullYear(),
          month: next.getMonth(),
          day: next.getDate(),
          hours: time.hours,
          minutes: time.minutes,
          seconds: time.seconds,
        },
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
    const date = partsFor(baseMs, mode);
    onChange(composeUtcMs({ ...date, hours, minutes, seconds }, mode));
  };

  return (
    <div
      className="flex flex-col gap-3"
      // Stop pointer/focus events from bubbling to base-ui's outside-press / focus-out
      // detectors, which can otherwise misclassify in-popover interactions (notably
      // Calendar day clicks and the native <input type="time"> picker) as outside
      // presses and close-then-reopen the popup.
      onFocus={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Calendar mode="single" onSelect={setFromCalendar} selected={calendarSelected} />
      <div className="flex items-center gap-2">
        <Input
          className="flex-1"
          disabled={disabled}
          onChange={(e) => setFromTime(e.target.value)}
          step={1}
          type="time"
          value={timeInputValue}
        />
        <Button disabled={disabled} onClick={() => onChange(Date.now())} size="sm" type="button" variant="primary">
          Now
        </Button>
      </div>
      {!hideTimezoneToggle && <ModeToggle mode={mode} onModeChange={onModeChange} />}
    </div>
  );
};

const DEFAULT_PLACEHOLDER = 'Enter unix timestamp';

// Replacement for `<DateTimeInput>` from `@redpanda-data/ui`. The text input
// shows the raw unix-millisecond number (commits on Enter/blur); the calendar
// icon opens a popover with a calendar, time input, "Now", and Local/UTC
// toggle. `value` and `onChange` always operate in UTC milliseconds.
export const DateTimeInput = ({
  value,
  onChange,
  disabled,
  defaultMode = 'local',
  hideTimezoneToggle = false,
  className,
  placeholder = DEFAULT_PLACEHOLDER,
  ...rest
}: DateTimeInputProps) => {
  const [mode, setMode] = useState<DateTimeInputMode>(defaultMode);
  const [draft, setDraft] = useState<string>('');

  const numericText = isFiniteNumber(value) ? String(value) : '';
  const displayedNumber = draft === '' ? numericText : draft;

  const commitNumeric = () => {
    if (draft === '') {
      return;
    }
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) {
      onChange(parsed);
    }
    setDraft('');
  };

  return (
    <Popover>
      <PopoverAnchor asChild>
        <Input
          className={className}
          data-testid={rest['data-testid']}
          disabled={disabled}
          onBlur={commitNumeric}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitNumeric();
            }
          }}
          placeholder={placeholder}
          size="lg"
          type="number"
          value={displayedNumber}
        >
          <InputEnd className="pointer-events-auto">
            <PopoverTrigger asChild>
              <button
                aria-label="Open calendar"
                className="text-muted-foreground hover:text-foreground"
                disabled={disabled}
                type="button"
              >
                <CalendarIcon className="size-4" />
              </button>
            </PopoverTrigger>
          </InputEnd>
        </Input>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-auto p-3">
        <DateTimePickerPanel
          disabled={disabled}
          hideTimezoneToggle={hideTimezoneToggle}
          mode={mode}
          onChange={onChange}
          onModeChange={setMode}
          value={value}
        />
      </PopoverContent>
    </Popover>
  );
};
