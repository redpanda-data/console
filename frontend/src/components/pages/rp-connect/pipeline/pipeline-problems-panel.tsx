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

import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { AlertCircle, ChevronDown, MousePointerClick } from 'lucide-react';
import { useState } from 'react';

import type { EditTarget } from '../utils/yaml';

export type PipelineProblem = {
  key: string;
  message: string;
  line?: number;
  /** Set when the problem maps to a node on the canvas — clicking selects it. */
  nodeId?: string;
  nodeLabel?: string;
  target?: EditTarget;
};

type PipelineProblemsPanelProps = {
  problems: PipelineProblem[];
  onSelectProblem: (nodeId: string, target: EditTarget) => void;
};

/**
 * A floating "N problems" chip on the Visual canvas. Expands into the list of lint
 * problems; clicking one selects the offending node (opening it in the inspector).
 * Problems that don't map to a node (e.g. top-level config) are listed inert.
 */
export function PipelineProblemsPanel({ problems, onSelectProblem }: PipelineProblemsPanelProps) {
  const [open, setOpen] = useState(false);

  if (problems.length === 0) {
    return null;
  }

  return (
    <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-1.5">
      <button
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-1.5 rounded-md border border-destructive/40 bg-background/90 px-2.5 py-1.5 font-medium text-destructive text-xs shadow-sm backdrop-blur-sm transition-colors hover:bg-destructive/5"
        data-testid="pipeline-problems-chip"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <AlertCircle className="size-3.5" />
        {problems.length === 1 ? '1 problem' : `${problems.length} problems`}
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div
          className="flex max-h-72 w-80 flex-col overflow-y-auto rounded-md border border-border bg-background/95 p-1 shadow-md backdrop-blur-sm"
          data-testid="pipeline-problems-list"
        >
          {problems.map((problem) =>
            problem.nodeId && problem.target ? (
              <button
                className="group flex w-full cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
                key={problem.key}
                onClick={() => {
                  onSelectProblem(problem.nodeId as string, problem.target as EditTarget);
                  setOpen(false);
                }}
                type="button"
              >
                <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                <span className="flex min-w-0 flex-col">
                  <Text as="span" className="text-foreground text-xs" variant="bodySmall">
                    {problem.message}
                  </Text>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MousePointerClick className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    {problem.nodeLabel}
                    {problem.line ? ` · line ${problem.line}` : ''}
                  </span>
                </span>
              </button>
            ) : (
              <div className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left" key={problem.key}>
                <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                <span className="flex min-w-0 flex-col">
                  <Text as="span" className="text-foreground text-xs" variant="bodySmall">
                    {problem.message}
                  </Text>
                  {problem.line ? <span className="text-[11px] text-muted-foreground">line {problem.line}</span> : null}
                </span>
              </div>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}
