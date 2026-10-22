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

import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Separator } from 'components/redpanda-ui/components/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { CalendarClock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePipelineSchedule } from 'state/rpcn-schedule-preview';

import {
  areSchedulesEnabled,
  LINE_LABEL,
  PipelineScheduleDialog,
  SCHEDULE_PREVIEW_NOTE,
  scheduleState,
  untilLabel,
  useClock,
} from './pipeline-schedule';
import { summarizePipelineEndYaml } from '../utils/input-end-behavior';
import { describeSchedule, formatRunTime, nextRuns, type PipelineSchedule } from '../utils/pipeline-schedule';

const UPCOMING_COUNT = 5;

// What a run record will carry once the scheduler keeps them (RFC REQ-2.3, 2.4).
const HISTORY_COLUMNS = ['Started', 'Ended', 'Duration', 'Messages in', 'Messages out', 'Outcome'];

const STATE_NOTE = {
  paused: 'The schedule is paused, so no runs are coming up.',
  'on-hold': 'Runs are on hold until the pipeline stops on its own again.',
} as const;

/** The Monitor lane's schedule: the runs coming up, and the history runs will be recorded in. */
export function PipelineRunsPanel({ pipelineId, configYaml }: { pipelineId: string; configYaml: string }) {
  const schedule = usePipelineSchedule(pipelineId);
  if (!(areSchedulesEnabled() && schedule)) {
    return null;
  }
  return <RunsPanelContent configYaml={configYaml} pipelineId={pipelineId} schedule={schedule} />;
}

function RunsPanelContent({
  pipelineId,
  configYaml,
  schedule,
}: {
  pipelineId: string;
  configYaml: string;
  schedule: PipelineSchedule;
}) {
  const [open, setOpen] = useState(false);
  const end = useMemo(() => summarizePipelineEndYaml(configYaml), [configYaml]);
  const now = useClock();
  const state = scheduleState(schedule, end);
  const upcoming = state === 'active' ? nextRuns(schedule, now, UPCOMING_COUNT) : [];

  return (
    <>
      <section className="flex flex-col gap-4" data-testid="pipeline-runs-panel">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="flex items-center gap-2 text-heading-md">
              Runs
              <Badge tone="informative" variant="outline">
                Preview
              </Badge>
            </h3>
            <span className="text-body-sm text-muted-foreground">
              {describeSchedule(schedule)} · {LINE_LABEL[state]}
            </span>
          </div>
          <Button icon={<CalendarClock />} onClick={() => setOpen(true)} size="sm" variant="outline">
            Edit schedule
          </Button>
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-2">
            <h4 className="font-medium text-body">Coming up</h4>
            {upcoming.length > 0 ? (
              <ul aria-label="Upcoming runs" className="flex flex-col gap-1 text-body-sm">
                {upcoming.map((run, i) => (
                  <li className="flex justify-between gap-3" key={run}>
                    <span>{formatRunTime(run, schedule.timeZone)}</span>
                    {i === 0 ? <span className="text-muted-foreground">{untilLabel(run, now)}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body-sm text-muted-foreground">
                {state === 'active' ? 'No run is coming up.' : STATE_NOTE[state]}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <h4 className="font-medium text-body">History</h4>
            <Table size="sm">
              <TableHeader>
                <TableRow>
                  {HISTORY_COLUMNS.map((column) => (
                    <TableHead key={column}>{column}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="h-20 text-center text-muted-foreground" colSpan={HISTORY_COLUMNS.length}>
                    No runs recorded yet. {SCHEDULE_PREVIEW_NOTE}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </section>
      <Separator className="my-8" variant="subtle" />
      <PipelineScheduleDialog
        configYaml={configYaml}
        fixHint="Edit the pipeline to give each input a stop condition."
        onOpenChange={setOpen}
        open={open}
        pipelineId={pipelineId}
      />
    </>
  );
}
