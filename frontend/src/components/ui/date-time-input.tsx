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

import { TonedIcon } from 'components/pages/shared/toned-icon';
import { Button } from 'components/redpanda-ui/components/button';
import { Calendar } from 'components/redpanda-ui/components/calendar';
import { Input, InputEnd } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { ToggleGroup, ToggleGroupItem } from 'components/redpanda-ui/components/toggle-group';
import './styles.css';
import { CalendarIcon } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

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
  <ToggleGroup
    onValueChange={(value: string[]) => {
      if (value[0] === 'local' || value[0] === 'utc') {
        onModeChange(value[0]);
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
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Inputs and calendar buttons own keyboard actions; this fieldset only isolates Base UI popover focus and pointer events.
    <fieldset
      aria-label="Date and time"
      className="flex flex-col gap-3"
      // Prevent base-ui from misclassifying in-popover clicks (Calendar days,
      // <input type="time">) as outside-presses that would close the popup.
      onFocus={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Scoped override: `--color-selected` and `--color-primary` are different shades, and this
      panel's other affordances (the "Now" button) paint `primary` — repaint the selected day to
      match without touching the shared Calendar. `p-0` strips Calendar's built-in padding, which
      otherwise stacks on this panel's own spacing. */}
      <div className="[--color-selected-foreground:var(--color-primary-foreground)] [--color-selected:var(--color-primary)]">
        <Calendar
          className="console-datetime-calendar"
          mode="single"
          onSelect={setFromCalendar}
          selected={calendarSelected}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-2">
          <Input
            className="flex-1"
            disabled={disabled}
            onChange={(e) => setFromTime(e.target.value)}
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
        {hideTimezoneToggle !== true && <ModeToggle mode={mode} onModeChange={onModeChange} />}
      </div>
    </fieldset>
  );
};

const DEFAULT_PLACEHOLDER = 'Enter unix timestamp';

// The text input takes raw unix milliseconds (commits on Enter/blur); the calendar icon opens a
// popover with a calendar, time input, "Now" and a Local/UTC toggle. `value`/`onChange` are UTC ms.
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
  const inputId = useId();
  const [mode, setMode] = useState<DateTimeInputMode>(defaultMode);
  const [draft, setDraft] = useState<string>('');

  const displayedNumber = draft === '' ? (isFiniteNumber(value) ? String(value) : '') : draft;

  const commitNumeric = () => {
    if (draft === '') {
      return;
    }
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) {
      // Values < 10^11 are seconds (10^11 ms is 1973; 10^11 s is year 5138).
      const utcMs = parsed < 1e11 ? parsed * 1000 : parsed;
      onChange(utcMs);
    }
    setDraft('');
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
    id: inputId,
    'data-testid': rest['data-testid'],
    disabled,
    onBlur: commitNumeric,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitNumeric();
      }
    },
    placeholder,
    size: 'lg' as const,
    type: 'number' as const,
    value: displayedNumber,
  };

  if (inline) {
    return (
      <div className="flex flex-col gap-3">
        {panel}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={inputId}>
            <span className="text-caption tracking-wide uppercase">Unix timestamp</span>
          </Label>
          <Input {...numberInputProps}>
            <InputEnd>
              <TonedIcon className="size-4" icon={CalendarIcon} tone="muted" />
            </InputEnd>
          </Input>
        </div>
      </div>
    );
  }

  return (
    <Popover>
      <PopoverAnchor
        render={
          <Input {...numberInputProps}>
            <InputEnd className="pointer-events-auto">
              <PopoverTrigger
                render={
                  <Button aria-label="Open calendar" disabled={disabled} size="icon-sm" type="button" variant="ghost">
                    <CalendarIcon className="size-4" />
                  </Button>
                }
              />
            </InputEnd>
          </Input>
        }
      />
      <PopoverContent align="start" className="console-datetime-popover w-auto">
        {panel}
      </PopoverContent>
    </Popover>
  );
};
