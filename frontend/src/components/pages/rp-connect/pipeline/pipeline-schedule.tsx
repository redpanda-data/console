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

import { zodResolver } from '@hookform/resolvers/zod';
import type { ComponentName } from 'assets/connectors/component-logo-map';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Combobox, type ComboboxOption } from 'components/redpanda-ui/components/combobox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Switch } from 'components/redpanda-ui/components/switch';
import { ToggleGroup, ToggleGroupItem } from 'components/redpanda-ui/components/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { cn } from 'components/redpanda-ui/lib/utils';
import { isFeatureFlagEnabled } from 'config';
import { AlertTriangle, Box, CalendarClock, CalendarOff, CalendarX2, CircleCheck, CircleX, Info } from 'lucide-react';
import { type ReactNode, useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react';
import { type UseFormReturn, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { usePipelineSchedule, useSchedulePreviewStore } from 'state/rpcn-schedule-preview';
import { prettyMilliseconds } from 'utils/utils';

import { inputEndRows } from './pipeline-end-chip';
import { RichText } from './stop-condition';
import { ConnectorLogo } from '../onboarding/connector-logo';
import { type PipelineEndStatus, type PipelineEndSummary, readPipelineEnd } from '../utils/input-end-behavior';
import { type PipelineFlowNode, parsePipelineFlowTree } from '../utils/pipeline-flow-parser';
import {
  browserTimeZone,
  defaultSchedule,
  describeRuntime,
  describeSchedule,
  formatRunTime,
  INTERVAL_UNITS,
  isValidTimeZone,
  maxRuntimeMinutes,
  nextRuns,
  normalizeSchedule,
  ordinal,
  type PipelineSchedule,
  pipelineScheduleSchema,
  RUNTIME_UNITS,
  runtimeOverlapsNextRun,
  SCHEDULE_CADENCES,
  type ScheduleCadence,
  WEEKDAY_ORDER,
  weekdayName,
} from '../utils/pipeline-schedule';

export const areSchedulesEnabled = (): boolean => isFeatureFlagEnabled('enableRpcnPipelineSchedules');

export const SCHEDULE_PREVIEW_NOTE =
  'Preview: saved in this browser only. The pipeline won’t start on this schedule yet.';

// ── Status ─────────────────────────────────────────────────────────────────

/** `on-hold`: switched on, but the pipeline no longer stops on its own. */
export type ScheduleState = 'active' | 'paused' | 'on-hold';

export function scheduleState(schedule: PipelineSchedule, end: PipelineEndSummary): ScheduleState {
  if (!schedule.enabled) {
    return 'paused';
  }
  return end.status === 'finite' ? 'active' : 'on-hold';
}

const CLOCK_TICK_MS = 30_000;

// One ticking clock shared by every schedule label on the page.
let clockNow = Date.now();
const clockListeners = new Set<() => void>();
let clockTimer: number | undefined;

function subscribeClock(listener: () => void): () => void {
  clockListeners.add(listener);
  if (clockTimer === undefined) {
    clockNow = Date.now();
    clockTimer = window.setInterval(() => {
      clockNow = Date.now();
      for (const notify of clockListeners) {
        notify();
      }
    }, CLOCK_TICK_MS);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) {
      window.clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

/** The current time, refreshed often enough for an "in 5m" label. */
export function useClock(): number {
  return useSyncExternalStore(subscribeClock, () => clockNow);
}

export const untilLabel = (at: number, now: number) =>
  at - now < 60_000 ? 'in under a minute' : `in ${prettyMilliseconds(at - now, { compact: true })}`;

const ON_HOLD_REASON: Record<Exclude<PipelineEndStatus, 'finite'>, string> = {
  continuous: 'The pipeline doesn’t stop on its own.',
  invalid: 'A stop condition is incomplete.',
  unknown: 'The pipeline may not stop on its own.',
  none: 'The pipeline has no input.',
};

type ScheduleCopy = {
  label: string;
  /** What the schedule does now, after its description. */
  detail: string;
  next?: number;
  tone: string;
  Icon: typeof CalendarClock;
};

function scheduleCopy(schedule: PipelineSchedule, end: PipelineEndSummary, now: number): ScheduleCopy {
  const state = scheduleState(schedule, end);
  if (state === 'paused') {
    return {
      label: 'Schedule paused',
      detail: 'No runs until the schedule is turned back on.',
      tone: 'text-muted-foreground',
      Icon: CalendarOff,
    };
  }
  if (state === 'on-hold') {
    const reason = end.behavior?.reason ?? ON_HOLD_REASON[end.status as Exclude<PipelineEndStatus, 'finite'>];
    return {
      label: 'Schedule on hold',
      detail: `${reason} Scheduled runs are on hold until the pipeline stops on its own again.`,
      tone: 'text-warning',
      Icon: CalendarX2,
    };
  }
  const description = describeSchedule(schedule);
  const [next] = nextRuns(schedule, now);
  return {
    label: next ? `${description} · next run ${untilLabel(next, now)}` : description,
    detail: next ? `Next run ${formatRunTime(next, schedule.timeZone)}.` : 'No run is coming up.',
    next,
    tone: 'text-foreground',
    Icon: CalendarClock,
  };
}

const ScheduleTooltipBody = ({ schedule, detail }: { schedule: PipelineSchedule; detail: string }) => (
  <>
    <span className="font-medium">{describeSchedule(schedule)}.</span> <RichText text={detail} />
    <span className="mt-1 block opacity-80">{SCHEDULE_PREVIEW_NOTE}</span>
  </>
);

// The last parseable YAML's answer, so a half-typed edit doesn't flip the schedule's status.
function useSettledEnd(configYaml: string): PipelineEndSummary {
  const end = useMemo(() => readPipelineEnd(configYaml), [configYaml]);
  const [lastParsed, setLastParsed] = useState<PipelineEndSummary>({ status: 'none' });
  useEffect(() => {
    if (end) {
      setLastParsed(end);
    }
  }, [end]);
  return end ?? lastParsed;
}

/** The schedule for a page header's meta row; opens the schedule dialog. */
export function PipelineScheduleMeta({
  pipelineId,
  configYaml,
  onOpen,
}: {
  pipelineId: string | undefined;
  configYaml: string;
  onOpen: () => void;
}) {
  const schedule = usePipelineSchedule(pipelineId);
  return schedule ? <ScheduleMetaContent configYaml={configYaml} onOpen={onOpen} schedule={schedule} /> : null;
}

// Mounted only with a schedule, so an unscheduled pipeline neither ticks a clock nor re-parses its YAML.
function ScheduleMetaContent({
  schedule,
  configYaml,
  onOpen,
}: {
  schedule: PipelineSchedule;
  configYaml: string;
  onOpen: () => void;
}) {
  const end = useSettledEnd(configYaml);
  const now = useClock();
  const { label, detail, tone, Icon } = scheduleCopy(schedule, end, now);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            className={cn('flex cursor-pointer items-center gap-1.5 hover:underline', tone)}
            data-testid="pipeline-schedule-meta"
            onClick={onOpen}
            type="button"
          />
        }
      >
        <Icon className="size-3.5" />
        {label}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <ScheduleTooltipBody detail={detail} schedule={schedule} />
      </TooltipContent>
    </Tooltip>
  );
}

/** A list row's schedule, under its "Runs" cell. */
export function PipelineScheduleLine({ pipelineId, end }: { pipelineId: string; end: PipelineEndSummary }) {
  const schedule = usePipelineSchedule(pipelineId);
  return schedule ? <ScheduleLineContent end={end} schedule={schedule} /> : null;
}

export const LINE_LABEL: Record<ScheduleState, string> = {
  active: 'Scheduled',
  paused: 'Paused',
  'on-hold': 'On hold',
};

function ScheduleLineContent({ schedule, end }: { schedule: PipelineSchedule; end: PipelineEndSummary }) {
  const now = useClock();
  const state = scheduleState(schedule, end);
  const { detail, next, Icon } = scheduleCopy(schedule, end, now);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            className={cn(
              'inline-flex cursor-default items-center gap-1.5 whitespace-nowrap text-body-sm',
              state === 'on-hold' ? 'text-warning' : 'text-muted-foreground'
            )}
            data-state={state}
            data-testid="pipeline-schedule-line"
            type="button"
          />
        }
      >
        <Icon className="size-3.5" />
        {next ? `Next ${untilLabel(next, now)}` : LINE_LABEL[state]}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <ScheduleTooltipBody detail={detail} schedule={schedule} />
      </TooltipContent>
    </Tooltip>
  );
}

// ── Readiness ──────────────────────────────────────────────────────────────

type Readiness = PipelineEndSummary['status'] | 'unparsed';

const READINESS_COPY: Record<Readiness, { title: string; detail: string }> = {
  finite: {
    title: 'Each run ends on its own',
    detail: 'Every input stops by itself, so each run finishes and the pipeline uses no compute until the next one.',
  },
  continuous: {
    title: 'This pipeline never stops on its own',
    detail: 'A scheduled run has to end by itself, and these inputs keep it running:',
  },
  invalid: {
    title: 'A stop condition is incomplete',
    detail: 'The pipeline can’t start until it’s fixed:',
  },
  unknown: {
    title: 'This pipeline may not stop on its own',
    detail: 'Make sure each of these ends, so every run does:',
  },
  none: {
    title: 'Add an input first',
    detail: 'A pipeline needs an input before it can run on a schedule.',
  },
  unparsed: {
    title: 'Fix the YAML first',
    detail: 'It has errors, so how each input stops can’t be read yet.',
  },
};

const BLOCKING_KINDS = new Set(['continuous', 'invalid', 'unknown']);

// The inputs a run's end turns on. A broker/sequence with a stop condition of its own ends by it, so its
// members don't count; one without is explained by its members.
function readinessRows(configYaml: string, ready: boolean) {
  const { nodes } = parsePipelineFlowTree(configYaml);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ownsEnd = (node: PipelineFlowNode | undefined) =>
    node?.kind === 'group' && node.stopSlot?.condition !== undefined;
  const decided = (node: PipelineFlowNode | undefined): boolean => {
    const parent = node?.parentId ? byId.get(node.parentId) : undefined;
    return parent !== undefined && (ownsEnd(parent) || decided(parent));
  };
  const rows = inputEndRows(nodes).filter((row) => {
    const node = byId.get(row.id);
    return (node?.kind !== 'group' || ownsEnd(node)) && !decided(node);
  });
  return ready ? rows : rows.filter((row) => BLOCKING_KINDS.has(row.effective.kind));
}

const CaveatLine = ({ text }: { text: string }) => (
  <span className="mt-0.5 flex items-start gap-1 text-warning">
    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
    <span>
      <RichText text={text} />
    </span>
  </span>
);

function ScheduleReadiness({
  configYaml,
  end,
  fixHint,
}: {
  configYaml: string;
  /** Undefined when the YAML doesn't parse. */
  end: PipelineEndSummary | undefined;
  fixHint: ReactNode;
}) {
  const ready = end?.status === 'finite';
  const rows = useMemo(() => (end ? readinessRows(configYaml, ready) : []), [configYaml, end, ready]);
  const copy = READINESS_COPY[end ? end.status : 'unparsed'];
  return (
    <Alert
      icon={ready ? <CircleCheck /> : <CircleX />}
      testId="schedule-readiness"
      variant={ready ? 'success' : 'warning'}
    >
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <span>{copy.detail}</span>
        {rows.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {rows.map((row) => (
              <li className="flex items-start gap-2" key={row.id}>
                <ConnectorLogo className="mt-0.5 size-4 shrink-0" fallback={Box} name={row.name as ComponentName} />
                <span className="flex min-w-0 flex-col">
                  <span>
                    <span className="font-medium">{row.labelText ?? row.name}</span>
                    <span className="text-muted-foreground">
                      {' — '}
                      <RichText text={row.effective.reason} />
                      {!ready && row.effective.finiteHint ? (
                        <>
                          {' '}
                          <RichText text={row.effective.finiteHint} />
                        </>
                      ) : null}
                    </span>
                  </span>
                  {row.effective.caveat ? <CaveatLine text={row.effective.caveat} /> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {!ready && end && end.status !== 'none' && rows.length === 0 && end.behavior ? (
          <RichText text={end.behavior.reason} />
        ) : null}
        {ready ? null : <div>{fixHint}</div>}
      </AlertDescription>
    </Alert>
  );
}

// ── Form ───────────────────────────────────────────────────────────────────

const CADENCE_LABELS: Record<ScheduleCadence, string> = {
  hourly: 'Hourly',
  daily: 'Daily',
  weekdays: 'Every weekday (Mon–Fri)',
  weekly: 'Weekly',
  monthly: 'Monthly',
  custom: 'Custom interval',
};

const UNIT_LABELS = { minutes: 'minutes', hours: 'hours', days: 'days', weeks: 'weeks' } as const;

const DAY_OF_MONTH_ITEMS = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [String(i + 1), ordinal(i + 1)]));

const HOUR_RE = /^([01]\d|2[0-3]):/;
const MINUTE_RE = /^[0-5]\d$/;

const minuteItems = (current: string) => {
  const minutes = new Set([
    ...Array.from({ length: 12 }, (_, i) => i * 5),
    ...(MINUTE_RE.test(current) ? [Number(current)] : []),
  ]);
  return Object.fromEntries(
    [...minutes].sort((a, b) => a - b).map((m) => [String(m).padStart(2, '0'), `:${String(m).padStart(2, '0')}`])
  );
};

const offsetLabel = (timeZone: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
    .formatToParts(Date.now())
    .find((part) => part.type === 'timeZoneName')?.value ?? '';

const zoneOption = (zone: string): ComboboxOption => ({ value: zone, label: `${zone} (${offsetLabel(zone)})` });

// Every zone with its offset takes some 420 formatters, so the list is built once.
let allZoneOptions: ComboboxOption[] | undefined;

function timeZoneOptions(current: string): ComboboxOption[] {
  if (!allZoneOptions) {
    const zones = new Set(Intl.supportedValuesOf?.('timeZone') ?? []);
    zones.add('UTC');
    allZoneOptions = [...zones].sort().map(zoneOption);
  }
  return allZoneOptions.some((option) => option.value === current)
    ? allZoneOptions
    : [...allZoneOptions, zoneOption(current)].sort((a, b) => a.value.localeCompare(b.value));
}

// Empty number fields hold NaN, which the schema reports as "Enter a number."
const numberValue = (value: number) => (Number.isNaN(value) ? '' : value);

type ScheduleForm = UseFormReturn<PipelineSchedule>;

function CadenceField({ form }: { form: ScheduleForm }) {
  return (
    <FormField
      control={form.control}
      name="cadence"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Repeats</FormLabel>
          <Select items={CADENCE_LABELS} onValueChange={field.onChange} value={field.value}>
            <FormControl
              render={
                <SelectTrigger testId="schedule-cadence">
                  <SelectValue />
                </SelectTrigger>
              }
            />
            <SelectContent>
              {SCHEDULE_CADENCES.map((cadence) => (
                <SelectItem key={cadence} value={cadence}>
                  {CADENCE_LABELS[cadence]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormItem>
      )}
    />
  );
}

function WeekdaysField({ form }: { form: ScheduleForm }) {
  const labelId = useId();
  return (
    <FormField
      control={form.control}
      name="weekdays"
      render={({ field }) => (
        <FormItem>
          <FormLabel id={labelId}>On</FormLabel>
          <FormControl
            render={
              <ToggleGroup
                aria-labelledby={labelId}
                attached={false}
                className="w-fit justify-start"
                multiple
                onValueChange={(values: string[]) => field.onChange(values.map(Number))}
                size="sm"
                value={field.value.map(String)}
                variant="outline"
              >
                {WEEKDAY_ORDER.map((day) => (
                  <ToggleGroupItem
                    aria-label={weekdayName(day)}
                    className="px-2.5"
                    key={day}
                    value={String(day)}
                    variant="outline"
                  >
                    {weekdayName(day, 'short')}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            }
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function DayOfMonthField({ form }: { form: ScheduleForm }) {
  const day = useWatch({ control: form.control, name: 'dayOfMonth' });
  return (
    <FormField
      control={form.control}
      name="dayOfMonth"
      render={({ field }) => (
        <FormItem>
          <FormLabel>On day</FormLabel>
          <Select
            items={DAY_OF_MONTH_ITEMS}
            onValueChange={(value) => field.onChange(Number(value))}
            value={String(field.value)}
          >
            <FormControl
              render={
                <SelectTrigger className="w-28" testId="schedule-day-of-month">
                  <SelectValue />
                </SelectTrigger>
              }
            />
            <SelectContent>
              {Object.entries(DAY_OF_MONTH_ITEMS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {day > 28 ? <FormDescription>Months without a {ordinal(day)} run on their last day.</FormDescription> : null}
        </FormItem>
      )}
    />
  );
}

function IntervalFields({ form }: { form: ScheduleForm }) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <FormField
        control={form.control}
        name="every"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Every</FormLabel>
            <div className="flex items-center gap-2">
              <FormControl
                render={
                  <Input
                    className="w-20"
                    min={1}
                    onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    testId="schedule-every"
                    type="number"
                    value={numberValue(field.value)}
                  />
                }
              />
              <FormField
                control={form.control}
                name="unit"
                render={({ field: unit }) => (
                  <Select items={UNIT_LABELS} onValueChange={unit.onChange} value={unit.value}>
                    <SelectTrigger aria-label="Interval unit" className="w-28" testId="schedule-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVAL_UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {UNIT_LABELS[u]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="startDate"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Starting</FormLabel>
            <FormControl render={<Input className="w-40" testId="schedule-start-date" type="date" {...field} />} />
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function TimeField({ form, cadence }: { form: ScheduleForm; cadence: ScheduleCadence }) {
  return (
    <FormField
      control={form.control}
      name="time"
      render={({ field }) =>
        cadence === 'hourly' ? (
          <FormItem>
            <FormLabel>At minute</FormLabel>
            <Select
              items={minuteItems(field.value.slice(3))}
              // A cleared time has no hour to keep, so it starts from midnight.
              onValueChange={(minute) =>
                field.onChange(`${HOUR_RE.test(field.value) ? field.value.slice(0, 2) : '00'}:${minute}`)
              }
              value={field.value.slice(3)}
            >
              <FormControl
                render={
                  <SelectTrigger className="w-28" testId="schedule-minute">
                    <SelectValue />
                  </SelectTrigger>
                }
              />
              <SelectContent>
                {Object.entries(minuteItems(field.value.slice(3))).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        ) : (
          <FormItem>
            <FormLabel>{cadence === 'custom' ? 'First run at' : 'At'}</FormLabel>
            <FormControl render={<Input className="w-36" testId="schedule-time" type="time" {...field} />} />
            <FormMessage />
          </FormItem>
        )
      }
    />
  );
}

function TimeZoneField({ form }: { form: ScheduleForm }) {
  const timeZone = useWatch({ control: form.control, name: 'timeZone' });
  const options = useMemo(() => timeZoneOptions(timeZone), [timeZone]);
  const mine = browserTimeZone();
  return (
    <FormField
      control={form.control}
      name="timeZone"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Time zone</FormLabel>
          {/* FormControl gives the input the id the label points at. */}
          <FormControl
            render={
              <Combobox
                clearable={false}
                inputTestId="schedule-time-zone"
                onChange={(value) => {
                  if (isValidTimeZone(value)) {
                    field.onChange(value);
                  }
                }}
                options={options}
                value={field.value}
              />
            }
          />
          <FormDescription>
            {field.value === mine ? (
              'Your time zone. Runs follow its clock, daylight saving included.'
            ) : (
              // The negative margin sets the link's text flush with the sentence.
              <>
                Runs follow this zone’s clock.{' '}
                <Button className="-mx-3 h-auto" onClick={() => field.onChange(mine)} size="sm" variant="link">
                  Use mine ({mine})
                </Button>
              </>
            )}
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function RuntimeField({ form }: { form: ScheduleForm }) {
  const limitRuntime = useWatch({ control: form.control, name: 'limitRuntime' });
  return (
    <div className="flex flex-col gap-2">
      <FormField
        control={form.control}
        name="limitRuntime"
        render={({ field }) => (
          <FormItem layout="horizontal">
            <FormControl
              render={<Switch checked={field.value} onCheckedChange={field.onChange} testId="schedule-limit-runtime" />}
            />
            <FormLabel>Limit how long a run can take</FormLabel>
          </FormItem>
        )}
      />
      {limitRuntime ? (
        <FormField
          control={form.control}
          name="maxRuntime"
          render={({ field }) => (
            <FormItem className="pl-12">
              <div className="flex items-center gap-2">
                <span className="text-body text-muted-foreground">Stop a run after</span>
                <FormControl
                  render={
                    <Input
                      aria-label="Maximum runtime"
                      className="w-20"
                      min={1}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      testId="schedule-max-runtime"
                      type="number"
                      value={numberValue(field.value)}
                    />
                  }
                />
                <FormField
                  control={form.control}
                  name="maxRuntimeUnit"
                  render={({ field: unit }) => (
                    <Select
                      items={{ minutes: 'minutes', hours: 'hours' }}
                      onValueChange={unit.onChange}
                      value={unit.value}
                    >
                      <SelectTrigger aria-label="Runtime unit" className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RUNTIME_UNITS.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : null}
    </div>
  );
}

const RUN_PREVIEW_COUNT = 3;

// The runs the schedule makes, listed even while it's off or on hold, so its times can be checked first.
function RunPreviewLines({ schedule, now, ready }: { schedule: PipelineSchedule; now: number; ready: boolean }) {
  let status: ReactNode = null;
  if (!schedule.enabled) {
    status = <span className="text-body-sm text-muted-foreground">Off: it runs at these times once turned on.</span>;
  } else if (!ready) {
    status = <span className="text-body-sm text-warning">On hold: no runs until the pipeline stops on its own.</span>;
  }
  const active = schedule.enabled && ready;
  return (
    <>
      {status}
      <ul
        aria-label="Next runs"
        className={cn('flex flex-col gap-0.5 text-body-sm', !active && 'text-muted-foreground')}
      >
        {nextRuns(schedule, now, RUN_PREVIEW_COUNT).map((run, i) => (
          <li className="flex justify-between gap-3" key={run}>
            <span>{formatRunTime(run, schedule.timeZone)}</span>
            {i === 0 && active ? <span className="text-muted-foreground">{untilLabel(run, now)}</span> : null}
          </li>
        ))}
      </ul>
    </>
  );
}

// Always rendered, so fixing a field never resizes the dialog under the pointer.
function RunPreview({ form, ready }: { form: ScheduleForm; ready: boolean }) {
  const values = useWatch({ control: form.control }) as PipelineSchedule;
  const now = useClock();
  const parsed = pipelineScheduleSchema.safeParse(values);
  const schedule = parsed.success ? parsed.data : undefined;
  const limit = schedule ? maxRuntimeMinutes(schedule) : undefined;
  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5"
      data-testid="schedule-preview"
    >
      {schedule ? (
        <>
          <span className="font-medium text-body">{describeSchedule(schedule)}</span>
          <RunPreviewLines now={now} ready={ready} schedule={schedule} />
        </>
      ) : (
        <>
          <span className="font-medium text-body">Next runs</span>
          <span className="text-body-sm text-muted-foreground">Finish the fields above to see when it runs.</span>
        </>
      )}
      <span className="flex items-start gap-1.5 text-body-sm text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          {limit ? `Runs stop after ${describeRuntime(limit)}. ` : null}
          If a run is still going when the next one is due, the next one is skipped.
          {schedule && runtimeOverlapsNextRun(schedule)
            ? ' This limit is longer than the time between runs, so some may skip.'
            : null}
        </span>
      </span>
    </div>
  );
}

function enabledHint(ready: boolean, enabled: boolean): string {
  if (ready) {
    return enabled
      ? 'Turn off to pause runs and keep these settings.'
      : 'Turn on to run the pipeline on this schedule.';
  }
  return enabled
    ? 'Runs are on hold. Turn this off to save changes, or add a stop condition first.'
    : 'Available once every input stops on its own. You can set the schedule up now.';
}

// ── Dialog ─────────────────────────────────────────────────────────────────

type ScheduleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  configYaml: string;
  /** How to add a stop condition from where the dialog opened. */
  fixHint: ReactNode;
  /** The YAML judged has edits the running pipeline doesn't have yet. */
  hasUnsavedChanges?: boolean;
};

export function PipelineScheduleDialog(props: ScheduleDialogProps) {
  const { open, onOpenChange } = props;
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {/* The popup unmounts once closed, so each open starts from the saved schedule. */}
      <DialogContent size="lg" testId="pipeline-schedule-dialog">
        <ScheduleDialogBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialogBody({ onOpenChange, pipelineId, configYaml, fixHint, hasUnsavedChanges }: ScheduleDialogProps) {
  const existing = usePipelineSchedule(pipelineId);
  const saveSchedule = useSchedulePreviewStore((s) => s.saveSchedule);
  const removeSchedule = useSchedulePreviewStore((s) => s.removeSchedule);
  const end = useMemo(() => readPipelineEnd(configYaml), [configYaml]);
  const ready = end?.status === 'finite';
  const form = useForm<PipelineSchedule>({
    resolver: zodResolver(pipelineScheduleSchema),
    // A new schedule starts switched off.
    defaultValues: existing ?? defaultSchedule(),
  });
  const cadence = useWatch({ control: form.control, name: 'cadence' });
  const enabled = useWatch({ control: form.control, name: 'enabled' });
  const blocked = enabled && !ready;

  const onSubmit = (submitted: PipelineSchedule) => {
    const values = normalizeSchedule(submitted);
    saveSchedule(pipelineId, values);
    toast.success(values.enabled ? 'Schedule saved' : 'Schedule saved, paused', {
      description: values.enabled ? describeSchedule(values) : undefined,
    });
    onOpenChange(false);
  };

  const onRemove = () => {
    removeSchedule(pipelineId);
    toast.success('Schedule removed');
    onOpenChange(false);
  };

  return (
    <Form {...form}>
      <form className="flex min-h-0 flex-col" noValidate onSubmit={form.handleSubmit(onSubmit)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Schedule runs
            <Badge tone="informative" variant="outline">
              Preview
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Start this pipeline automatically. Each run ends when its inputs stop. {SCHEDULE_PREVIEW_NOTE}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5">
          <ScheduleReadiness configYaml={configYaml} end={end} fixHint={fixHint} />
          {hasUnsavedChanges ? (
            <p className="-mt-3 text-body-sm text-muted-foreground">
              {ready
                ? 'Judged on your unsaved changes. Save the pipeline so scheduled runs use them.'
                : 'Judged on your unsaved changes.'}
            </p>
          ) : null}
          <FormField
            control={form.control}
            name="enabled"
            render={({ field }) => (
              <FormItem layout="horizontal-start">
                <FormControl
                  render={
                    <Switch
                      checked={field.value}
                      disabled={!(ready || field.value)}
                      onCheckedChange={field.onChange}
                      testId="schedule-enabled"
                    />
                  }
                />
                <div className="flex flex-col gap-0.5">
                  <FormLabel>Run on a schedule</FormLabel>
                  <FormDescription>{enabledHint(ready, field.value)}</FormDescription>
                </div>
              </FormItem>
            )}
          />
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="w-64">
                <CadenceField form={form} />
              </div>
              {cadence === 'custom' ? null : <TimeField cadence={cadence} form={form} />}
              {cadence === 'monthly' ? <DayOfMonthField form={form} /> : null}
            </div>
            {cadence === 'weekly' ? <WeekdaysField form={form} /> : null}
            {cadence === 'custom' ? (
              <div className="flex flex-wrap items-start gap-3">
                <IntervalFields form={form} />
                <TimeField cadence={cadence} form={form} />
              </div>
            ) : null}
            <TimeZoneField form={form} />
            <RuntimeField form={form} />
          </div>
          <RunPreview form={form} ready={ready} />
        </DialogBody>
        <DialogFooter className="sm:justify-between">
          {existing ? (
            <Button onClick={onRemove} testId="schedule-remove" variant="destructive-ghost">
              Remove schedule
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button onClick={() => onOpenChange(false)} variant="outline">
              Cancel
            </Button>
            <Button disabled={blocked} testId="schedule-save" type="submit">
              {enabled ? 'Save schedule' : 'Save paused'}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </Form>
  );
}

/** A header's schedule button and the dialog it opens; `meta` opens the same dialog. */
export function usePipelineScheduleControl({
  pipelineId,
  configYaml,
  fixHint,
  hasUnsavedChanges,
}: {
  pipelineId: string | undefined;
  configYaml: string;
  fixHint: ReactNode;
  hasUnsavedChanges?: boolean;
}): { button: ReactNode; meta: ReactNode; dialog: ReactNode; scheduled: boolean } {
  const [open, setOpen] = useState(false);
  const schedule = usePipelineSchedule(pipelineId);
  if (!areSchedulesEnabled()) {
    return { button: null, meta: null, dialog: null, scheduled: false };
  }
  const button = pipelineId ? (
    <Button
      className="shrink-0"
      icon={<CalendarClock />}
      onClick={() => setOpen(true)}
      size="sm"
      testId="pipeline-schedule-button"
      variant="outline"
    >
      Schedule
    </Button>
  ) : (
    <Tooltip>
      <TooltipTrigger render={<span className="shrink-0" />}>
        <Button disabled icon={<CalendarClock />} size="sm" variant="outline">
          Schedule
        </Button>
      </TooltipTrigger>
      <TooltipContent>Save the pipeline first, then set its schedule.</TooltipContent>
    </Tooltip>
  );
  return {
    button,
    scheduled: schedule !== undefined,
    // Null without a schedule, so the meta row draws no separator for it.
    meta: schedule ? (
      <PipelineScheduleMeta configYaml={configYaml} onOpen={() => setOpen(true)} pipelineId={pipelineId} />
    ) : null,
    dialog: pipelineId ? (
      <PipelineScheduleDialog
        configYaml={configYaml}
        fixHint={fixHint}
        hasUnsavedChanges={hasUnsavedChanges}
        onOpenChange={setOpen}
        open={open}
        pipelineId={pipelineId}
      />
    ) : null,
  };
}
