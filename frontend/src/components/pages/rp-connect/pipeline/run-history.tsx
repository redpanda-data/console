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
import { StatusBadge, type StatusBadgeVariant } from 'components/redpanda-ui/components/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { cn } from 'components/redpanda-ui/lib/utils';
import { CalendarClock, Play } from 'lucide-react';
import { useState } from 'react';
import { prettyMilliseconds } from 'utils/utils';

import { type PipelineRun, type RunOutcome, runDurationMs, runTally } from '../utils/pipeline-runs';
import { runTimeParts } from '../utils/pipeline-schedule';

const OUTCOME: Record<RunOutcome, { label: string; variant: StatusBadgeVariant; bar: string }> = {
  running: { label: 'Running', variant: 'informative', bar: 'animate-pulse bg-primary' },
  completed: { label: 'Completed', variant: 'success', bar: 'bg-success' },
  failed: { label: 'Failed', variant: 'destructive', bar: 'bg-destructive' },
  'timed-out': { label: 'Timed out', variant: 'warning', bar: 'bg-warning' },
  stopped: { label: 'Stopped', variant: 'disabled', bar: 'bg-muted-foreground/50' },
  skipped: { label: 'Skipped', variant: 'disabled', bar: 'bg-border' },
};

const STRIP_RUNS = 20;
const COLLAPSED_ROWS = 10;
const COMPACT_NUMBER = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

const count = (value: number | undefined) => (value === undefined ? '—' : COMPACT_NUMBER.format(value));
const ago = (ms: number) => (ms < 60_000 ? 'just now' : `${prettyMilliseconds(ms, { compact: true })} ago`);

/** The latest runs as ticks, oldest first, coloured by how each went. */
export function RunOutcomeStrip({ runs }: { runs: PipelineRun[] }) {
  const latest = runs.slice(0, STRIP_RUNS).reverse();
  const { completed, ended } = runTally(runs);
  return (
    <span className="inline-flex items-center gap-2 text-body-sm text-muted-foreground">
      <span
        aria-label={`Last ${latest.length} runs: ${completed} of ${ended} that ended completed`}
        className="inline-flex items-end gap-0.5"
        role="img"
      >
        {latest.map((run) => (
          <span aria-hidden className={cn('h-4 w-1.5 rounded-sm', OUTCOME[run.outcome].bar)} key={run.id} />
        ))}
      </span>
      {ended > 0 ? `${completed} of ${ended} completed` : null}
    </span>
  );
}

/**
 * A pipeline's runs, newest first: when each started and what started it, how long it took and how it went.
 * Message counts get a column only once a run has them; only a server can count a real run's messages.
 */
export function RunHistoryTable({ runs, timeZone, now }: { runs: PipelineRun[]; timeZone: string; now: number }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? runs : runs.slice(0, COLLAPSED_ROWS);
  const counted = runs.some((run) => run.messagesIn !== undefined || run.messagesOut !== undefined);
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-md border">
        <Table aria-label="Run history" size="sm">
          <TableHeader>
            <TableRow>
              <TableHead>Started</TableHead>
              <TableHead>Duration</TableHead>
              {counted ? <TableHead>Messages</TableHead> : null}
              <TableHead>Outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((run) => {
              const { date, time } = runTimeParts(run.startTime, timeZone);
              const duration = runDurationMs(run, now);
              const outcome = OUTCOME[run.outcome];
              const TriggerIcon = run.trigger === 'schedule' ? CalendarClock : Play;
              return (
                <TableRow data-outcome={run.outcome} key={run.id}>
                  <TableCell className="align-top">
                    <span className="flex flex-col">
                      <span>
                        {date}, {time}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-body-sm text-muted-foreground">
                        {ago(now - run.startTime)}
                        <span aria-hidden>·</span>
                        <TriggerIcon aria-hidden className="size-3" />
                        {run.trigger === 'schedule' ? 'Scheduled' : 'Manual'}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="align-top tabular-nums">
                    {duration === undefined ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <>
                        {prettyMilliseconds(duration, { unitCount: 2, secondsDecimalDigits: 0 })}
                        {run.outcome === 'running' ? <span className="text-muted-foreground"> so far</span> : null}
                      </>
                    )}
                  </TableCell>
                  {counted ? (
                    <TableCell className="align-top tabular-nums">
                      {count(run.messagesIn)} in <span className="text-muted-foreground">·</span>{' '}
                      {count(run.messagesOut)} out
                    </TableCell>
                  ) : null}
                  <TableCell className="align-top">
                    <span className="flex flex-col items-start gap-0.5">
                      <StatusBadge pulsing={run.outcome === 'running'} size="sm" variant={outcome.variant}>
                        {outcome.label}
                      </StatusBadge>
                      {run.note ? (
                        <span className="max-w-64 truncate text-body-sm text-muted-foreground" title={run.note}>
                          {run.note}
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {runs.length > COLLAPSED_ROWS ? (
        <Button className="self-start" onClick={() => setShowAll((v) => !v)} size="sm" variant="ghost">
          {showAll ? 'Show fewer' : `Show all ${runs.length} runs`}
        </Button>
      ) : null}
    </div>
  );
}
