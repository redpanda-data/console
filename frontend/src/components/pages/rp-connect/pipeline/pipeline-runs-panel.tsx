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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from 'components/redpanda-ui/components/empty';
import { Separator } from 'components/redpanda-ui/components/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { History } from 'lucide-react';
import { useMemo } from 'react';
import { usePipelineRuns } from 'state/rpcn-run-history-preview';

import { RunHistoryTable, RunOutcomeStrip } from './run-history';
import { useClock } from './use-clock';
import { summarizePipelineEndYaml } from '../utils/input-end-behavior';

const RUNS_PREVIEW_NOTE =
  'Preview: lists the runs started from this browser. Runs started anywhere else appear once Redpanda records them.';

/** The Monitor lane's run history, for a pipeline that stops on its own. */
export function PipelineRunsPanel({ pipelineId, configYaml }: { pipelineId: string; configYaml: string }) {
  const end = useMemo(() => summarizePipelineEndYaml(configYaml), [configYaml]);
  if (end.status !== 'finite') {
    return null;
  }
  return <RunsPanelContent pipelineId={pipelineId} />;
}

function RunsPanelContent({ pipelineId }: { pipelineId: string }) {
  const runs = usePipelineRuns(pipelineId);
  const now = useClock();

  return (
    <>
      <section className="flex flex-col gap-4" data-testid="pipeline-runs-panel">
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
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-body-sm font-medium text-muted-foreground">History</h4>
            {runs.length > 0 ? <RunOutcomeStrip runs={runs} /> : null}
          </div>
          {runs.length > 0 ? (
            <RunHistoryTable now={now} runs={runs} />
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <History />
                </EmptyMedia>
                <EmptyTitle>No runs yet</EmptyTitle>
                <EmptyDescription>
                  Each run you start is listed with when it started, how long it took and how it ended.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </section>
      <Separator className="my-8" variant="subtle" />
    </>
  );
}
