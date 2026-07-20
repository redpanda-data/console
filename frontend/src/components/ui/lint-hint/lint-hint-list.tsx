/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { SimpleCodeBlock } from 'components/redpanda-ui/components/code-block';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { cn } from 'components/redpanda-ui/lib/utils';
import { CheckCircleIcon } from 'components/icons';
import type { LintHint } from '@buf/redpandadata_common.bufbuild_es/redpanda/api/common/v1/linthint_pb';
import { memo } from 'react';

type LintHintListProps = {
  lintHints: Record<string, LintHint>;
  className?: string;
  isPending?: boolean;
};

export const LintHintList: React.FC<LintHintListProps> = memo(({ className, lintHints, isPending }) => {
  const hasHints = lintHints && Object.keys(lintHints).length > 0;

  if (!hasHints && !isPending) {
    return (
      <div className={cn('flex items-center gap-2 py-4 text-muted-foreground', className)}>
        <CheckCircleIcon className="size-4 text-success" />
        <div className="text-body text-muted-foreground">No issues found</div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {isPending && !hasHints && <Spinner className="size-4 text-foreground" />}
      {/* One code block per hint, stacked — no outer wrapper, to avoid a box-in-box look. */}
      {hasHints &&
        Object.entries(lintHints).map(([toolName, hint]) => (
          <div className="flex min-w-0 flex-col gap-1" key={toolName}>
            {/* Type label heads its message so each hint reads as one group. */}
            {hint.lintType && (
              <div className="text-body-sm font-medium text-muted-foreground uppercase tracking-wide">
                {hint.lintType}
              </div>
            )}
            {/* min-w-0 + wrapping the inner <pre> keep long lint messages from stretching the page. */}
            <SimpleCodeBlock
              className="my-0 text-xs [&_pre]:whitespace-pre-wrap [&_pre]:break-words"
              code={hint.line > 0 ? `Line ${hint.line}, Col ${hint.column}: ${hint.hint}` : hint.hint}
              width="full"
            />
          </div>
        ))}
    </div>
  );
});

LintHintList.displayName = 'LintHintList';
