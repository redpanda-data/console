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

import { type IconTone, TonedIcon } from 'components/pages/shared/toned-icon';
import { Button } from 'components/redpanda-ui/components/button';
import { AlertCircle, KeyRound, type LucideIcon, MousePointerClick, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { pluralizeWithNumber } from 'utils/string';

import { DeprecationText } from './deprecation-notice';
import { FloatingChipPanel } from './floating-chip-panel';
import type { DeprecationNotice } from '../utils/deprecation';
import type { EditTarget } from '../utils/yaml';

export type PipelineProblem = {
  key: string;
  message: string;
  line?: number;
  /** Set when the problem maps to a node on the canvas — clicking selects it. */
  nodeId?: string;
  nodeLabel?: string;
  target?: EditTarget;
  /** A case-entry node's routing-condition target, so the inspector opens its condition. */
  caseTarget?: EditTarget;
};

/** A deprecated component in use — a warning, located like a problem. */
export type DeprecationProblem = Omit<PipelineProblem, 'message'> & { notice: DeprecationNotice };

type PipelineProblemsPanelProps = {
  problems: PipelineProblem[];
  onSelectProblem: (nodeId: string, target: EditTarget, caseTarget?: EditTarget) => void;
  /** Secrets referenced by the pipeline that don't exist in the store yet. */
  missingSecrets?: string[];
  /** Open the add-secrets flow (omit to hide the action, e.g. in view mode). */
  onAddSecrets?: () => void;
  deprecations?: DeprecationProblem[];
};

// Section heading in the expanded panel, shown only when more than one kind of issue is present.
const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="px-2 pt-1.5 pb-0.5 text-body-sm font-medium tracking-wide text-muted-foreground uppercase">
    {children}
  </div>
);

// One located issue: clickable row that selects its node, or inert when it maps to no node.
const ProblemRow = ({
  problem,
  onSelect,
  icon = AlertCircle,
  tone = 'destructive',
  children,
}: {
  problem: Omit<PipelineProblem, 'message'>;
  onSelect?: () => void;
  icon?: LucideIcon;
  tone?: IconTone;
  children: ReactNode;
}) => {
  const body = (
    <>
      <TonedIcon className="mt-0.5 size-3.5 shrink-0" icon={icon} tone={tone} />
      <span className="flex min-w-0 flex-col">
        <span className="text-body-sm text-foreground">{children}</span>
        {onSelect ? (
          <span className="flex items-center gap-1 text-body-sm text-muted-foreground">
            <span className="inline-flex opacity-0 transition-opacity group-hover:opacity-100">
              <MousePointerClick className="size-3" />
            </span>
            {problem.nodeLabel}
            {problem.line ? ` · line ${problem.line}` : ''}
          </span>
        ) : (
          problem.line && <span className="text-body-sm text-muted-foreground">line {problem.line}</span>
        )}
      </span>
    </>
  );
  return onSelect ? (
    <button
      className="group flex w-full cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
      onClick={onSelect}
      type="button"
    >
      {body}
    </button>
  ) : (
    <div className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left">{body}</div>
  );
};

const SecretsSection = ({ missingSecrets, onAddSecrets }: { missingSecrets: string[]; onAddSecrets?: () => void }) => (
  <div data-testid="pipeline-problems-secrets">
    <div className="flex items-center justify-between gap-2 px-2 pt-1.5 pb-1">
      <span className="text-body-sm font-medium tracking-wide text-muted-foreground uppercase">Missing secrets</span>
      {onAddSecrets ? (
        // The icon is a child rather than the `icon` prop, which would widen the `xs` gap.
        <Button data-testid="missing-secrets-add" onClick={onAddSecrets} size="xs" variant="outline">
          Add secrets
          <KeyRound className="size-3" />
        </Button>
      ) : null}
    </div>
    {missingSecrets.map((name) => (
      <div className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left" key={`secret-${name}`}>
        <TonedIcon className="mt-0.5 size-3.5 shrink-0" icon={KeyRound} tone="warning" />
        <span className="flex min-w-0 flex-col">
          <span className="text-body-sm text-foreground">
            Missing secret <span className="font-mono font-medium">{name}</span>
          </span>
          <span className="text-body-sm text-muted-foreground">Referenced by the pipeline but not created</span>
        </span>
      </div>
    ))}
  </div>
);

// The chip's wording: specific when there's only one kind of issue, "issues" for a mix.
function issuesLabel(problemCount: number, secretCount: number, deprecationCount: number): string {
  const counts = [problemCount, secretCount, deprecationCount];
  if (counts.filter((count) => count > 0).length > 1) {
    return pluralizeWithNumber(problemCount + secretCount + deprecationCount, 'issue');
  }
  if (problemCount > 0) {
    return pluralizeWithNumber(problemCount, 'problem');
  }
  if (secretCount > 0) {
    return pluralizeWithNumber(secretCount, 'missing secret');
  }
  return pluralizeWithNumber(deprecationCount, 'deprecated component');
}

// The chip's icon and colour: the most severe kind present wins.
function chipStyle(hasLint: boolean, hasSecrets: boolean): { icon: LucideIcon; className: string } {
  if (hasLint) {
    return { icon: AlertCircle, className: 'border-destructive/40 text-destructive hover:bg-destructive/5' };
  }
  return {
    icon: hasSecrets ? KeyRound : TriangleAlert,
    className: 'border-warning/50 text-warning hover:bg-warning-wash',
  };
}

// Clicking a located issue selects its node and collapses the list.
function selectHandler(
  problem: Omit<PipelineProblem, 'message'>,
  onSelectProblem: PipelineProblemsPanelProps['onSelectProblem'],
  close: () => void
): (() => void) | undefined {
  const { nodeId, target, caseTarget } = problem;
  if (!(nodeId && target)) {
    return;
  }
  return () => {
    onSelectProblem(nodeId, target, caseTarget);
    close();
  };
}

/**
 * Floating "issues" chip on the Visual canvas unifying lint problems, missing secrets, and
 * deprecated components. Expands to a list; clicking an issue selects its node (issues without a
 * node are inert).
 */
export function PipelineProblemsPanel({
  problems,
  onSelectProblem,
  missingSecrets = [],
  onAddSecrets,
  deprecations = [],
}: PipelineProblemsPanelProps) {
  const hasLint = problems.length > 0;
  const hasSecrets = missingSecrets.length > 0;
  const hasDeprecations = deprecations.length > 0;
  if (!(hasLint || hasSecrets || hasDeprecations)) {
    return null;
  }

  const { icon: Icon, className } = chipStyle(hasLint, hasSecrets);

  return (
    <FloatingChipPanel
      chipClassName={className}
      chipTestId="pipeline-problems-chip"
      label={issuesLabel(problems.length, missingSecrets.length, deprecations.length)}
      leading={<Icon className="size-3.5" />}
      listClassName="w-80"
      listTestId="pipeline-problems-list"
    >
      {(close) => (
        <>
          {hasSecrets ? (
            <SecretsSection
              missingSecrets={missingSecrets}
              onAddSecrets={
                onAddSecrets
                  ? () => {
                      onAddSecrets();
                      close();
                    }
                  : undefined
              }
            />
          ) : null}

          {hasLint && hasSecrets ? (
            <div className="mt-1 border-t border-border/60 pt-1">
              <SectionLabel>Problems</SectionLabel>
            </div>
          ) : null}
          {problems.map((problem) => (
            <ProblemRow key={problem.key} onSelect={selectHandler(problem, onSelectProblem, close)} problem={problem}>
              {problem.message}
            </ProblemRow>
          ))}

          {hasDeprecations ? (
            <div data-testid="pipeline-problems-deprecations">
              {hasLint || hasSecrets ? (
                <div className="mt-1 border-t border-border/60 pt-1">
                  <SectionLabel>Deprecated components</SectionLabel>
                </div>
              ) : null}
              {deprecations.map((deprecation) => (
                <ProblemRow
                  icon={TriangleAlert}
                  key={deprecation.key}
                  onSelect={selectHandler(deprecation, onSelectProblem, close)}
                  problem={deprecation}
                  tone="warning"
                >
                  <DeprecationText notice={deprecation.notice} />
                </ProblemRow>
              ))}
            </div>
          ) : null}
        </>
      )}
    </FloatingChipPanel>
  );
}
