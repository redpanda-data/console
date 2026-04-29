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
import { Input } from 'components/redpanda-ui/components/input';
import { Popover, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { cn } from 'components/redpanda-ui/lib/utils';
import { CalendarIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

const DATE_PART_LENGTH = 10; // YYYY-MM-DD
const TIME_PART_LENGTH = 8; // HH:mm:ss

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

const toLocalDate = (utcMs: number) => new Date(utcMs);

const formatDateLabel = (utcMs: number) => {
  const d = toLocalDate(utcMs);
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const formatTimeLabel = (utcMs: number) => {
  const d = toLocalDate(utcMs);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const composeUtcMs = (datePart: string, timePart: string): number | null => {
  if (datePart.length !== DATE_PART_LENGTH) {
    return null;
  }
  const normalizedTime = timePart.length === 5 ? `${timePart}:00` : timePart;
  if (normalizedTime.length !== TIME_PART_LENGTH) {
    return null;
  }
  const ms = Date.parse(`${datePart}T${normalizedTime}`);
  return Number.isFinite(ms) ? ms : null;
};

type DateTimeInputProps = {
  value: number | undefined;
  onChange: (utcMs: number) => void;
  disabled?: boolean;
  className?: string;
  'data-testid'?: string;
};

/**
 * Local date+time picker. Replaces `<DateTimeInput>` from `@redpanda-data/ui`,
 * which depended on date-fns-tz@2 and forced a build-time shim. Uses the
 * Calendar + Popover + Input registry components and works in the user's local
 * timezone — value/onChange remain UTC milliseconds for parity with the old API.
 */
export const DateTimeInput = ({ value, onChange, disabled, className, ...rest }: DateTimeInputProps) => {
  const [open, setOpen] = useState(false);
  const effectiveValue = value ?? Date.now();

  const dateLabel = useMemo(() => formatDateLabel(effectiveValue), [effectiveValue]);
  const timeLabel = useMemo(() => formatTimeLabel(effectiveValue), [effectiveValue]);

  const setDate = (next: Date | undefined) => {
    if (!next) {
      return;
    }
    const ms = composeUtcMs(
      `${pad(next.getFullYear(), 4)}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`,
      timeLabel
    );
    if (ms !== null) {
      onChange(ms);
    }
  };

  const setTime = (nextTime: string) => {
    const ms = composeUtcMs(dateLabel, nextTime);
    if (ms !== null) {
      onChange(ms);
    }
  };

  return (
    <div className={cn('flex items-center gap-2', className)} data-testid={rest['data-testid']}>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger>
          <Button
            className={cn('w-[160px] justify-start font-normal', !value && 'text-muted-foreground')}
            disabled={disabled}
            type="button"
            variant="outline"
          >
            <CalendarIcon className="mr-2 size-4" />
            {dateLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            onSelect={(d) => {
              setDate(d);
              setOpen(false);
            }}
            selected={toLocalDate(effectiveValue)}
          />
        </PopoverContent>
      </Popover>
      <Input
        className="w-[120px]"
        disabled={disabled}
        onChange={(e) => setTime(e.target.value)}
        step={1}
        type="time"
        value={timeLabel}
      />
    </div>
  );
};
