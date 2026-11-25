/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { LintHint } from '@buf/redpandadata_common.bufbuild_es/redpanda/api/common/v1/linthint_pb';
import { CheckCircleIcon } from 'components/icons';
import { TonedIcon } from 'components/pages/shared/toned-icon';
import { SimpleCodeBlock } from 'components/redpanda-ui/components/code-block';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { cn } from 'components/redpanda-ui/lib/utils';
import { memo } from 'react';

type LintHintListProps = {
  lintHints: Record<string, LintHint>;
  className?: string;
  isPending?: boolean;
};

export const LintHintList: React.FC<LintHintListProps> = memo(({ className, lintHints, isPending }) => {
  const hasHints = Object.keys(lintHints).length > 0;

  if (!(hasHints || isPending === true)) {
    return (
      <div className={cn('flex items-center gap-2 py-4 text-muted-foreground', className)}>
        <TonedIcon className="size-4" icon={CheckCircleIcon} tone="success" />
        <div className="text-body text-muted-foreground">No issues found</div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {isPending === true && !hasHints && <Spinner />}
      {/* One code block per hint, stacked — no outer wrapper, to avoid a box-in-box look. */}
      {hasHints &&
        Object.entries(lintHints).map(([toolName, hint]) => (
          <div className="flex min-w-0 flex-col gap-1" key={toolName}>
            {/* Type label heads its message so each hint reads as one group. */}
            {hint.lintType && (
              <div className="text-body-sm font-medium tracking-wide text-muted-foreground uppercase">
                {hint.lintType}
              </div>
            )}
            {/* min-w-0 + wrapping the inner <pre> keep long lint messages from stretching the page. */}
            <SimpleCodeBlock
              className="my-0"
              code={hint.line > 0 ? `Line ${hint.line}, Col ${hint.column}: ${hint.hint}` : hint.hint}
              size="sm"
              width="full"
              wrap
            />
          </div>
        ))}
    </div>
  );
});

LintHintList.displayName = 'LintHintList';
