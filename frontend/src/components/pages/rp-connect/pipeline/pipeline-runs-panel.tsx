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
import { toast } from 'sonner';
import { usePipelineSchedule, useSchedulePreviewStore } from 'state/rpcn-schedule-preview';

import {
  areSchedulesEnabled,
  PipelineScheduleDialog,
  SCHEDULE_PREVIEW_NOTE,
  untilLabel,
  useClock,
} from './pipeline-schedule';
import { ScheduleGlance, UpcomingRunTiles } from './schedule-glance';
import { summarizePipelineEndYaml } from '../utils/input-end-behavior';
import {
  browserTimeZone,
  describeRuntime,
  describeSchedule,
  maxRuntimeMinutes,
  nextRuns,
  type PipelineSchedule,
  scheduleState,
} from '../utils/pipeline-schedule';

const UPCOMING_COUNT = 5;

/** The Monitor lane's schedule: the runs coming up, and the history runs will be recorded in. */
export function PipelineRunsPanel({ pipelineId, configYaml }: { pipelineId: string; configYaml: string }) {
  const schedule = usePipelineSchedule(pipelineId);
  if (!(areSchedulesEnabled() && schedule)) {
    return null;
  }
  return <RunsPanelContent configYaml={configYaml} pipelineId={pipelineId} schedule={schedule} />;
}

// The dashed placeholder the lane's other sections use while they have nothing to show.
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
  <Empty className="gap-2 rounded-md border border-dashed p-4 md:p-6">
    <EmptyHeader className="gap-1">
      {icon ? <EmptyMedia variant="icon">{icon}</EmptyMedia> : null}
      <EmptyTitle className="text-body">{title}</EmptyTitle>
      <EmptyDescription className="text-body">{description}</EmptyDescription>
    </EmptyHeader>
    {action ? <EmptyContent>{action}</EmptyContent> : null}
  </Empty>
);

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
  const saveSchedule = useSchedulePreviewStore((s) => s.saveSchedule);
  const end = useMemo(() => summarizePipelineEndYaml(configYaml), [configYaml]);
  const now = useClock();
  const state = scheduleState(schedule, end);
  const upcoming = state === 'active' ? nextRuns(schedule, now, UPCOMING_COUNT) : [];
  const runtime = maxRuntimeMinutes(schedule);

  const resume = () => {
    saveSchedule(pipelineId, { ...schedule, enabled: true });
    toast.success('Schedule resumed', { description: describeSchedule(schedule) });
  };

  let comingUp: ReactNode;
  if (upcoming.length > 0) {
    comingUp = (
      <UpcomingRunTiles
        label="Upcoming runs"
        runs={upcoming}
        soonLabel={untilLabel(upcoming[0], now)}
        timeZone={schedule.timeZone}
      />
    );
  } else if (state === 'paused') {
    comingUp = (
      <RunsPlaceholder
        action={
          end.status === 'finite' ? (
            <Button onClick={resume} size="sm" variant="outline">
              Resume schedule
            </Button>
          ) : null
        }
        description="No runs until the schedule is turned back on."
        title="Paused"
      />
    );
  } else {
    comingUp = (
      <RunsPlaceholder
        description={
          state === 'on-hold' ? 'No runs until the pipeline stops on its own again.' : 'No run is coming up.'
        }
        title={state === 'on-hold' ? 'On hold' : 'Nothing coming up'}
      />
    );
  }

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
                <TooltipContent className="max-w-xs">{SCHEDULE_PREVIEW_NOTE}</TooltipContent>
              </Tooltip>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-body-sm text-muted-foreground">
              <ScheduleGlance muted={state !== 'active'} schedule={schedule} />
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
          </div>
          <Button icon={<CalendarClock />} onClick={() => setOpen(true)} size="sm" variant="ghost">
            Edit schedule
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          <h4 className="font-medium text-body-sm text-muted-foreground">Upcoming</h4>
          {comingUp}
        </div>
        <div className="flex flex-col gap-2">
          <h4 className="font-medium text-body-sm text-muted-foreground">History</h4>
          <RunsPlaceholder
            description="Each run will show when it started and ended, how it went, and how many messages it moved."
            icon={<History />}
            title="No runs yet"
          />
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
