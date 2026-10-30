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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from 'components/redpanda-ui/components/empty';
import { Separator } from 'components/redpanda-ui/components/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { CalendarClock, History } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { usePipelineRuns } from 'state/rpcn-run-history-preview';
import { areSchedulesEnabled, usePipelineSchedule, useSchedulePreviewStore } from 'state/rpcn-schedule-preview';
import { showToast } from 'utils/toast.utils';

import { PipelineScheduleDialog, useClock } from './pipeline-schedule';
import { RunHistoryTable, RunOutcomeStrip } from './run-history';
import { ScheduleGlance, UpcomingRunTiles } from './schedule-glance';
import { type PipelineEndSummary, summarizePipelineEndYaml } from '../utils/input-end-behavior';
import {
  browserTimeZone,
  describeRuntime,
  describeSchedule,
  maxRuntimeMinutes,
  nextRuns,
  type PipelineSchedule,
  scheduleState,
  untilLabel,
} from '../utils/pipeline-schedule';

const UPCOMING_COUNT = 5;

const RUNS_PREVIEW_NOTE =
  'Preview: lists the runs started from this browser. Runs started anywhere else appear once Redpanda records them.';

/**
 * The Monitor lane's runs, for a pipeline that ends (it stops on its own, or runs on a schedule): its
 * history and, with a schedule, the runs coming up.
 */
export function PipelineRunsPanel({ pipelineId, configYaml }: { pipelineId: string; configYaml: string }) {
  const stored = usePipelineSchedule(pipelineId);
  const schedule = areSchedulesEnabled() ? stored : undefined;
  const end = useMemo(() => summarizePipelineEndYaml(configYaml), [configYaml]);
  if (!(schedule || end.status === 'finite')) {
    return null;
  }
  return <RunsPanelContent configYaml={configYaml} end={end} pipelineId={pipelineId} schedule={schedule} />;
}

// The placeholder the lane's other sections use while they have nothing to show.
const RunsPlaceholder = ({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
}) => (
  <Empty>
    <EmptyHeader>
      {icon ? <EmptyMedia variant="icon">{icon}</EmptyMedia> : null}
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyDescription>{description}</EmptyDescription>
    </EmptyHeader>
    {action ? <EmptyContent>{action}</EmptyContent> : null}
  </Empty>
);

// The cadence under the panel's title.
function ScheduleSummaryLine({ schedule, active }: { schedule: PipelineSchedule; active: boolean }) {
  const runtime = maxRuntimeMinutes(schedule);
  return (
    <div className="flex flex-wrap items-center gap-x-2 text-body-sm text-muted-foreground">
      <ScheduleGlance muted={!active} schedule={schedule} />
      {/* The tiles carry the zone's abbreviation; its name only matters when it isn't the viewer's. */}
      {schedule.timeZone === browserTimeZone() ? null : (
        <>
          <span aria-hidden>·</span>
          <span>{schedule.timeZone}</span>
        </>
      )}
      {runtime ? (
        <>
          <span aria-hidden>·</span>
          <span>Stops after {describeRuntime(runtime)}</span>
        </>
      ) : null}
    </div>
  );
}

// The runs a schedule makes next, or why it makes none.
function ScheduledRuns({
  pipelineId,
  schedule,
  end,
  now,
}: {
  pipelineId: string;
  schedule: PipelineSchedule;
  end: PipelineEndSummary;
  now: number;
}) {
  const saveSchedule = useSchedulePreviewStore((s) => s.saveSchedule);
  const state = scheduleState(schedule, end);
  const upcoming = state === 'active' ? nextRuns(schedule, now, UPCOMING_COUNT) : [];
  if (upcoming.length > 0) {
    return (
      <UpcomingRunTiles
        label="Scheduled runs"
        runs={upcoming}
        soonLabel={untilLabel(upcoming[0], now)}
        timeZone={schedule.timeZone}
      />
    );
  }
  if (state === 'paused') {
    const resume = () => {
      saveSchedule(pipelineId, { ...schedule, enabled: true });
      showToast({ status: 'success', title: 'Schedule resumed', description: describeSchedule(schedule) });
    };
    return (
      <RunsPlaceholder
        action={
          end.status === 'finite' ? (
            <Button onClick={resume} size="sm" variant="outline">
              Resume schedule
            </Button>
          ) : null
        }
        description="No runs until the schedule is turned on."
        title="Paused"
      />
    );
  }
  return (
    <RunsPlaceholder
      description={state === 'on-hold' ? 'No runs until the pipeline stops on its own again.' : 'No run is coming up.'}
      title={state === 'on-hold' ? 'On hold' : 'Nothing coming up'}
    />
  );
}

function RunsPanelContent({
  pipelineId,
  configYaml,
  end,
  schedule,
}: {
  pipelineId: string;
  configYaml: string;
  end: PipelineEndSummary;
  /** Set with the schedule preview on and a schedule saved. */
  schedule?: PipelineSchedule;
}) {
  const [open, setOpen] = useState(false);
  const runs = usePipelineRuns(pipelineId);
  const now = useClock();

  return (
    <>
      <section className="flex flex-col gap-4" data-testid="pipeline-runs-panel">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h3 className="text-heading-md">Runs</h3>
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex" />}>
                  <Badge tone="informative" variant="outline">
                    Preview
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{RUNS_PREVIEW_NOTE}</TooltipContent>
              </Tooltip>
            </div>
            {schedule ? (
              <ScheduleSummaryLine active={scheduleState(schedule, end) === 'active'} schedule={schedule} />
            ) : null}
          </div>
          {schedule ? (
            <Button icon={<CalendarClock />} onClick={() => setOpen(true)} size="sm" variant="ghost">
              Edit schedule
            </Button>
          ) : null}
        </div>
        {schedule ? (
          <div className="flex flex-col gap-2">
            <h4 className="text-body-sm font-medium text-muted-foreground">Scheduled runs</h4>
            <ScheduledRuns end={end} now={now} pipelineId={pipelineId} schedule={schedule} />
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-body-sm font-medium text-muted-foreground">History</h4>
            {runs.length > 0 ? <RunOutcomeStrip runs={runs} /> : null}
          </div>
          {runs.length > 0 ? (
            <RunHistoryTable now={now} runs={runs} />
          ) : (
            <RunsPlaceholder
              description="Each run you start is listed with when it started, how long it took and how it ended."
              icon={<History />}
              title="No runs yet"
            />
          )}
        </div>
      </section>
      <Separator className="my-8" variant="subtle" />
      {/* Outside the schedule's gate, so removing it still animates the dialog out. */}
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
