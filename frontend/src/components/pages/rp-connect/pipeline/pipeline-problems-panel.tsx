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
import { Text } from 'components/redpanda-ui/components/typography';
import { AlertCircle, KeyRound, MousePointerClick } from 'lucide-react';
import { pluralizeWithNumber } from 'utils/string';

import { FloatingChipPanel } from './floating-chip-panel';
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

type PipelineProblemsPanelProps = {
  problems: PipelineProblem[];
  onSelectProblem: (nodeId: string, target: EditTarget, caseTarget?: EditTarget) => void;
  /** Secrets referenced by the pipeline that don't exist in the store yet. */
  missingSecrets?: string[];
  /** Open the add-secrets flow (omit to hide the action, e.g. in view mode). */
  onAddSecrets?: () => void;
};

// Section heading in the expanded panel, shown only when more than one kind of issue is present.
const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <Text
    as="div"
    className="px-2 pt-1.5 pb-0.5 text-muted-foreground uppercase tracking-wide"
    variant="captionStrongMedium"
  >
    {children}
  </Text>
);

// One lint problem: clickable row that selects its node, or inert when it maps to no node.
const ProblemRow = ({ problem, onSelect }: { problem: PipelineProblem; onSelect?: () => void }) => {
  const body = (
    <>
      <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
      <span className="flex min-w-0 flex-col">
        <Text as="span" className="text-foreground text-xs" variant="bodySmall">
          {problem.message}
        </Text>
        {onSelect ? (
          <span className="flex items-center gap-1 text-muted-foreground text-xs">
            <MousePointerClick className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
            {problem.nodeLabel}
            {problem.line ? ` · line ${problem.line}` : ''}
          </span>
        ) : (
          problem.line && <span className="text-muted-foreground text-xs">line {problem.line}</span>
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
      <Text as="span" className="text-muted-foreground uppercase tracking-wide" variant="captionStrongMedium">
        Missing secrets
      </Text>
      {onAddSecrets ? (
        <Button
          className="h-6 gap-1 px-2 text-xs"
          data-testid="missing-secrets-add"
          icon={<KeyRound className="size-3" />}
          onClick={onAddSecrets}
          size="xs"
          variant="outline"
        >
          Add secrets
        </Button>
      ) : null}
    </div>
    {missingSecrets.map((name) => (
      <div className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left" key={`secret-${name}`}>
        <KeyRound className="mt-0.5 size-3.5 shrink-0 text-warning" />
        <span className="flex min-w-0 flex-col">
          <Text as="span" className="text-foreground text-xs" variant="bodySmall">
            Missing secret <span className="font-medium font-mono">{name}</span>
          </Text>
          <span className="text-muted-foreground text-xs">Referenced by the pipeline but not created</span>
        </span>
      </div>
    ))}
  </div>
);

// The chip's wording: specific when there's only one kind of issue, "issues" for a mix.
function issuesLabel(problemCount: number, secretCount: number): string {
  if (secretCount === 0) {
    return pluralizeWithNumber(problemCount, 'problem');
  }
  if (problemCount > 0) {
    return pluralizeWithNumber(problemCount + secretCount, 'issue');
  }
  return pluralizeWithNumber(secretCount, 'missing secret');
}

/**
 * Floating "issues" chip on the Visual canvas unifying lint problems and missing secrets.
 * Expands to a list; clicking a problem selects its node (problems without a node are inert).
 */
export function PipelineProblemsPanel({
  problems,
  onSelectProblem,
  missingSecrets = [],
  onAddSecrets,
}: PipelineProblemsPanelProps) {
  const hasLint = problems.length > 0;
  const hasSecrets = missingSecrets.length > 0;
  if (!(hasLint || hasSecrets)) {
    return null;
  }

  const Icon = hasLint ? AlertCircle : KeyRound;
  const tone = hasLint
    ? 'border-destructive/40 text-destructive hover:bg-destructive/5'
    : 'border-warning/50 text-warning hover:bg-warning-subtle';

  return (
    <FloatingChipPanel
      chipClassName={tone}
      chipTestId="pipeline-problems-chip"
      label={issuesLabel(problems.length, missingSecrets.length)}
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
            <div className="mt-1 border-border/60 border-t pt-1">
              <SectionLabel>Problems</SectionLabel>
            </div>
          ) : null}
          {problems.map((problem) => (
            <ProblemRow
              key={problem.key}
              onSelect={
                problem.nodeId && problem.target
                  ? () => {
                      onSelectProblem(problem.nodeId as string, problem.target as EditTarget, problem.caseTarget);
                      close();
                    }
                  : undefined
              }
              problem={problem}
            />
          ))}
        </>
      )}
    </FloatingChipPanel>
  );
}
